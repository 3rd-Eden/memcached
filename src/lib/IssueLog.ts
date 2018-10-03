import { spawn } from 'child_process'
import { EventEmitter } from 'events'
// import * as util from 'util'

import * as Utils from './utils'

type PingCallback =
    (err: Error | boolean, result: string | boolean) => void

function ping(host: string, callback: PingCallback) {
    const isWin = process.platform.indexOf('win') === 0 // win32 or win64
    const arg = isWin ? '-n' : '-c'
    const pong = spawn('ping', [arg, '3', host]) // only ping 3 times

    pong.stdout.on('data', (data: Buffer) => {
        callback(false, data.toString().split('\n')[0].substr(14))
        pong.kill()
    })

    pong.stderr.on('data', (data: Buffer) => {
        callback(new Error(data.toString().split('\n')[0].substr(14)), false)
        pong.kill()
    })
}

export interface IIssueLogOptions {
    failOverServers: Array<string>
    failures: number
    server: string
    hosts: Array<string>
    reconnect: number
    retry: number
    remove: boolean
    failuresTimeout: number
}

export interface IIssueLogDetails {
    server: string
    hosts: Array<string>
    messages: Array<string>
}

export interface IFailueDetails extends IIssueLogDetails {
    failures: number
    totalFailures: number
}

export interface ISuccessDetails extends IIssueLogDetails {
    totalReconnectsAttempted: number
    totalReconnectsSuccess: number
    totalReconnectsFailed: number
    totalDownTime: number
}

export type IssueLogDetails =
    IFailueDetails | ISuccessDetails

export class IssueLog extends EventEmitter {
    public failed: boolean
    public failOverServers: Array<string> | null = null

    private args: string
    private config: IIssueLogOptions
    private messages: Array<string>
    private locked: boolean
    private isScheduledToReconnect: boolean

    private totalFailures: number
    private totalReconnectsAttempted: number
    private totalReconnectsSuccess: number

    private failuresResetId: NodeJS.Timer | null = null

    constructor(args: IIssueLogOptions) {
        super()
        this.args = JSON.stringify(args)
        this.config = Utils.merge({}, args)
        this.messages = []
        this.failed = false
        this.locked = false
        this.isScheduledToReconnect = false
        this.failOverServers = args.failOverServers || null

        this.totalFailures = 0
        this.totalReconnectsAttempted = 0
        this.totalReconnectsSuccess = 0
    }

    public log(message: string): void {
        this.failed = true
        this.messages.push(message || 'No message specified')

        // All failures must occur within `failuresTimeout` ms from the initial
        // failure in order for node to be disconnected or removed.
        if (this.config.failures && this.config.failures === JSON.parse(this.args).failures) {
            this.failuresResetId = setTimeout(() => {
                this.failuresReset()
            }, this.config.failuresTimeout)
        }

        if (this.config.failures && !this.locked) {
            this.locked = true
            setTimeout(() => {
                this.attemptRetry()
            }, this.config.retry)
            this.emit('issue', this.details)

        } else {
            if (this.failuresResetId) {
                clearTimeout(this.failuresResetId)
            }

            if (this.config.remove) {
                this.emit('remove', this.details)

            } else if (!this.isScheduledToReconnect) {
                this.isScheduledToReconnect = true
                setTimeout(() => {
                    this.attemptReconnect()
                }, this.config.reconnect)
            }
        }
    }

    public failuresReset(): void {
        this.config = Utils.merge({}, JSON.parse(this.args))
    }

    get details(): IssueLogDetails {
        if (this.config.failures) {
            return {
                server: this.config.server,
                hosts: this.config.hosts,
                messages: this.messages,
                failures: this.config.failures,
                totalFailures: this.totalFailures,
            }

        } else {
            const totalReconnectsFailed = this.totalReconnectsAttempted - this.totalReconnectsSuccess
            const totalDownTime = (totalReconnectsFailed * this.config.reconnect) + (this.totalFailures * this.config.retry)
            return {
                server: this.config.server,
                hosts: this.config.hosts,
                messages: this.messages,
                totalReconnectsAttempted: this.totalReconnectsAttempted,
                totalReconnectsSuccess: this.totalReconnectsSuccess,
                totalReconnectsFailed,
                totalDownTime,
            }

        }
    }

    public attemptRetry(): void {
        this.totalFailures += 1
        this.config.failures -= 1
        this.failed = false
        this.locked = false
    }

    public attemptReconnect(): void {
        const self = this
        this.totalReconnectsAttempted++
        this.emit('reconnecting', this.details)

        // Ping the server
        ping(this.config.hosts[1], (err: any) => {
            // still no access to the server
            if (err) {
                self.messages.push(err.message || 'No message specified')
                return setTimeout(self.attemptReconnect.bind(self), self.config.reconnect)
            }

            self.emit('reconnected', self.details)

            self.totalReconnectsSuccess++
            self.messages.length = 0
            self.failed = false
            self.isScheduledToReconnect = false

            // we connected again, so we are going through the whole cycle again
            Utils.merge(self, JSON.parse(JSON.stringify(self.config)))
        })
    }
}
