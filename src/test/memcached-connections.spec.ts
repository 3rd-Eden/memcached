import { assert } from 'chai'
import { Memcached } from '../lib'
import * as common from './common'

(global as any).testnumbers = (global as any).testnumbers || +(Math.random() * 1000000).toFixed()

/**
 * Test connection issues
 */
describe('Memcached connections', () => {
    it('should call the callback only once if theres an error', async () => {
        const memcached = new Memcached('127.0.1:1234', { retries: 3 })

        return memcached.get('idontcare').then((val: any) => {
            memcached.end()
            throw new Error('Should reject')
        }, (err: Error) => {
            // it should only be called once
            assert.equal(err.message, 'connect ECONNREFUSED 127.0.0.1:1234')
            memcached.end()
        })
    }).timeout(60000)

    it('should remove a failed server', async () => {
        const memcached = new Memcached('127.0.1:1234', {
            timeout: 1000,
            retries: 0,
            failures: 0,
            retry: 100,
            remove: true,
        })

        return memcached.get('idontcare').then((val: any) => {
            memcached.end()
            throw new Error('Should reject')
        }, (err1: Error) => {
            return memcached.get('idontcare').then((val: any) => {
                memcached.end()
                throw new Error('Should reject')
            }, (err: Error) => {
                assert.equal(err.message, 'Server at 127.0.1:1234 not available')
                memcached.end()
            })

        })
    }).timeout(60000)

    it('should rebalance to remaining healthy server', async () => {
        const memcached = new Memcached(['fake:1234', common.servers.single], {
            timeout: 1000,
            retries: 0,
            failures: 0,
            retry: 100,
            remove: true,
            redundancy: 1,
        })

        // 'a' goes to fake server. first request will cause server to be removed
        return memcached.get('a').then((val: any) => {
            memcached.end()
            throw new Error('Should reject')
        }, (err1) => {
            assert.exists(err1)
            // second request should be rebalanced to healthy server
            return memcached.get('a').then((val: any) => {
                memcached.end()
            })
        })
    }).timeout(60000)

    it('should properly schedule failed server retries', async () => {
        const server = '127.0.0.1:1234'
        const memcached = new Memcached(server, {
            retries: 0,
            failures: 5,
            retry: 100,
        })

        // First request will schedule a retry attempt, and lock scheduling
        return memcached.get('idontcare').then((val: any) => {
            throw new Error('Should reject')
        }, (err1: Error) => {
            assert.equal(err1.message, 'connect ECONNREFUSED 127.0.0.1:1234')
            assert.equal((memcached as any)._issues[server].config.failures, 5)
            assert.equal((memcached as any)._issues[server].locked, true)
            assert.equal((memcached as any)._issues[server].failed, true)

            // Immediate request should not decrement failures
            return memcached.get('idontcare').then((val: any) => {
                throw new Error('Should reject')
            }, (err2: Error) => {
                assert.equal(err2.message, 'Server at 127.0.0.1:1234 not available')
                assert.equal((memcached as any)._issues[server].config.failures, 5)
                assert.equal((memcached as any)._issues[server].locked, true)
                assert.equal((memcached as any)._issues[server].failed, true)
                // Once `retry` time has passed, failures should decrement by one
                common.wait(500).then(() => {
                    // Server should be back in action
                    assert.equal((memcached as any)._issues[server].locked, false)
                    assert.equal((memcached as any)._issues[server].failed, false)
                    return memcached.get('idontcare').then((val: any) => {

                    }, (err3: Error) => {
                        // Server should be marked healthy again, though we'll get this error
                        assert.equal(err3.message, 'connect ECONNREFUSED 127.0.0.1:1234')
                        assert.equal((memcached as any)._issues[server].config.failures, 4)
                        memcached.end()
                    })
                }) // `retry` is 100 so wait 100
            })
        })
    })

    it('should properly schedule server reconnection attempts', async () => {
        const server = '127.0.0.1:1234'
        const memcached = new Memcached(server, {
            retries: 3,
            minTimeout: 0,
            maxTimeout: 100,
            failures: 0,
            reconnect: 100,
        })
        let reconnectAttempts = 0

        memcached.on('reconnecting', () => {
            reconnectAttempts++
        })

        // First request will mark server dead and schedule reconnect
        return memcached.get('idontcare').then((val: any) => {
            memcached.end()
            throw new Error('Should reject')
        }, (err1: Error) => {
            assert.equal(err1.message, 'connect ECONNREFUSED 127.0.0.1:1234')
            // Second request should not schedule another reconnect
            return memcached.get('idontcare').then((val: any) => {
                memcached.end()
                throw new Error('Should reject')
            }, (err2: Error) => {
                assert.equal(err2.message, 'Server at 127.0.0.1:1234 not available')
                // Allow enough time to pass for a connection retries to occur
                return common.wait(500).then(() => {
                    memcached.end()
                    assert.deepEqual(reconnectAttempts, 1)
                })
            })
        })
    })

    it('should reset failures after reconnecting to failed server', async () => {
        const server = '127.0.0.1:1234'
        const memcached = new Memcached(server, {
            retries: 0,
            minTimeout: 0,
            maxTimeout: 100,
            failures: 1,
            retry: 1,
            reconnect: 100,
        })

        // First request will mark server failed
        return memcached.get('idontcare').then((val: any) => {
            memcached.end()
            throw new Error('Should reject')
        }, (err1: Error) => {
            assert.equal(err1.message, 'connect ECONNREFUSED 127.0.0.1:1234')

            // Wait 10ms, server should be back online
            common.wait(500).then(() => {
                // Second request will mark server dead
                return memcached.get('idontcare').then((val: any) => {
                    memcached.end()
                    throw new Error('Should reject')
                }, (err2: Error) => {
                    assert.equal(err2.message, 'connect ECONNREFUSED 127.0.0.1:1234')

                    // Third request should find no servers
                    return memcached.get('idontcare').then((val: any) => {
                        memcached.end()
                        throw new Error('Should reject')
                    }, (err3: Error) => {
                        assert.equal(err3.message, 'Server at 127.0.0.1:1234 not available')

                        // Give enough time for server to reconnect
                        return common.wait(500).then(() => {
                            // Server should be reconnected, but expect ECONNREFUSED
                            return memcached.get('idontcare').then((val: any) => {
                                memcached.end()
                                throw new Error('Should reject')
                            }, (err4: Error) => {
                                memcached.end()
                                assert.equal(err4.message, 'connect ECONNREFUSED 127.0.0.1:1234')
                            })
                        })
                    })
                })
            })
        })
    }).timeout(60000)

    it('should default to port 11211', async () => {
        // Use an IP without port
        const server = '127.0.0.1'
        const memcached = new Memcached(server)

        return memcached.get('idontcare').then((val: any) => {
            memcached.end()
            assert.equal(Object.keys((memcached as any)._connections)[0], '127.0.0.1:11211')
        })
    })

    it('should not create multiple connections with no port', async () => {
        // Use an IP without port
        const server = '127.0.0.1'
        const memcached = new Memcached(server)
        let conn: any

        return memcached.get('idontcare').then(() => {
            conn = (memcached as any)._connections['127.0.0.1:11211']
            return memcached.get('idontcare').then(() => {
                memcached.end()
                assert.equal((memcached as any)._connections['127.0.0.1:11211'], conn)
            })
        })
    })

    it('should return error on connection timeout', async () => {
        // Use a non routable IP
        const server = '10.255.255.255:1234'
        const memcached = new Memcached(server, {
            retries: 0,
            timeout: 100,
            idle: 1000,
            failures: 0,
        })

        return memcached.get('idontcare').then((val: any) => {
            memcached.end()
            throw new Error('Should reject')
        }, (err: Error) => {
            memcached.end()
        })
    })

    it('should remove connection when idle', async () => {
        const memcached = new Memcached(common.servers.single, {
            retries: 0,
            timeout: 100,
            idle: 100,
            failures: 0,
        })

        return memcached.get('idontcare').then(() => {
            assert.equal((memcached as any)._connections[common.servers.single].pool.length, 1)

            common.wait(110).then(() => {
                memcached.end()
                assert.equal((memcached as any)._connections[common.servers.single].pool.length, 0)
            })
        })
    })

    it('should remove server if error occurs after connection established', async () => {
        const memcached = new Memcached(common.servers.single, {
            poolSize: 1,
            retries: 0,
            timeout: 1000,
            idle: 5000,
            failures: 0,
        })

        // Should work fine
        return memcached.get('idontcare').then(() => {
            // Fake an error on the connected socket which should mark server failed
            const socket = (memcached as any)._connections[common.servers.single].pool.pop()
            socket.emit('error', new Error('Dummy error'))

            return memcached.get('idontcare').then(() => {
                memcached.end()
                throw new Error('Should reject')
            }, (err2: Error) => {
                assert.equal(err2.message, 'Server at localhost:11211 not available')
            })
        })
    })

    it('should reset failures if all failures do not occur within failuresTimeout ms', async () => {
        const server = '10.255.255.255:1234'
        const memcached = new Memcached(server, {
            retries: 0,
            timeout: 10,
            idle: 1000,
            retry: 10,
            failures: 2,
            failuresTimeout: 100,
        })

        return memcached.get('idontcare').then(() => {
            memcached.end()
            throw new Error('Should reject')
        }, (err: Error) => {
            assert.equal(err.message, 'connect ECONNREFUSED 127.0.0.1:1234')

            // Allow `retry` ms to pass, which will decrement failures
            return common.wait(15).then(() => {
                assert.deepEqual((memcached as any)._issues[server].config.failures, 1)
                // Allow failuresTimeout ms to pass, which should reset failures
                return common.wait(300).then(() => {
                    memcached.end()
                    assert.deepEqual(
                        JSON.parse((memcached as any)._issues[server].args).failures,
                        (memcached as any)._issues[server].config.failures,
                    )
                })
            })
        })
    })
})
