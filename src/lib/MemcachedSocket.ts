import { Socket } from 'net'

import { IMemcachedCommand } from './commands'

export class MemcachedSocket extends Socket {
    public streamID: number
    public metaData: Array<IMemcachedCommand>
    public responseBuffer: string
    public bufferArray: Array<string>
    public serverAddress: string
    public hosts: Array<any>

    constructor(id: number, server: string) {
        super()
        this.streamID = id
        this.metaData = []
        this.responseBuffer = ''
        this.bufferArray = []
        this.hosts = []
        this.serverAddress = server
    }
}
