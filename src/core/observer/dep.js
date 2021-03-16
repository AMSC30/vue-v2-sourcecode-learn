/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
export default class Dep {
    static target: ?Watcher
    id: number
    subs: Array<Watcher>

    constructor() {
        this.id = uid++
        this.subs = []
    }

    addSub(sub: Watcher) {
        this.subs.push(sub)
    }

    removeSub(sub: Watcher) {
        remove(this.subs, sub)
    }

    depend() {
        if (Dep.target) {
            // 调用watcher的addDep方法
            Dep.target.addDep(this)
        }
    }

    notify() {
        // 通知watcher进行更新
        const subs = this.subs.slice()
        if (process.env.NODE_ENV !== 'production' && !config.async) {
            subs.sort((a, b) => a.id - b.id)
        }
        for (let i = 0, l = subs.length; i < l; i++) {
            // 调用watcher的update方法
            subs[i].update()
        }
    }
}

Dep.target = null
const targetStack = []

export function pushTarget(target: ?Watcher) {
    targetStack.push(target)
    Dep.target = target
}

export function popTarget() {
    targetStack.pop()
    Dep.target = targetStack[targetStack.length - 1]
}
