export class MemcachedMissingKey extends Error {
    constructor(key: string) {
        super(`Given key[${key}] does not have a value in Memcached`)
    }
}

export class MemcachedExpiredValue extends Error {
    constructor(key: string) {
        super(`Value for given key[${key}] is expired`)
    }
}

export class MemcachedOpFailed extends Error {
    constructor(operation: string, key: string) {
        super(`Operation[${operation}] failed for key[${key}]`)
    }
}
