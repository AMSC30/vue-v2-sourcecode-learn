/* @flow */

import { warn, remove, isObject, parsePath, _Set as Set, handleError, noop } from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
    constructor(
        vm: Component,
        expOrFn: string | Function,
        cb: Function,
        options?: ?Object,
        isRenderWatcher?: boolean
    ) {
        // 每个watcher上都挂载了一个vue实例
        this.vm = vm

        if (isRenderWatcher) {
            vm._watcher = this
        }

        // 将当前watcher推入到vue实例的_watcher数组中
        // 从这里可以看出，每个watcher都保存了一个vue实例，每个vue实例都放置了若干个watcher
        vm._watchers.push(this)

        // 根据传入的options初始化watcher实例属性
        if (options) {
            this.deep = !!options.deep
            this.user = !!options.user
            this.lazy = !!options.lazy
            this.sync = !!options.sync
            this.before = options.before
        } else {
            this.deep = this.user = this.lazy = this.sync = false
        }
        // 挂载依赖数据变化时的回调函数
        this.cb = cb
        this.id = ++uid
        this.active = true
        this.dirty = this.lazy

        // 存放依赖收集器
        this.deps = []
        this.newDeps = []
        this.depIds = new Set()
        this.newDepIds = new Set()

        // 初始化取值表达式
        this.expression = process.env.NODE_ENV !== 'production' ? expOrFn.toString() : ''

        // 如果初始化watcher实例时传入的表达式是一个函数，直接赋给watcher的getter属性
        // 如果传入的是一个取值路径，根据路径生成getter函数
        this.getter = typeof expOrFn === 'function' ? expOrFn : parsePath(expOrFn)

        // 调用get方法取值
        this.value = this.lazy ? undefined : this.get()
    }

    get() {
        // 将当前实例挂载到Dep的target上面
        pushTarget(this)
        let value
        const vm = this.vm
        // 根据取值函数获取值
        try {
            // 此方法有两个作用
            // 一个是进行DOM更新
            // 一个是进行依赖收集
            value = this.getter.call(vm, vm)
        } catch (e) {
            if (this.user) {
                handleError(e, vm, `getter for watcher "${this.expression}"`)
            } else {
                throw e
            }
        } finally {
            if (this.deep) {
                // 进行深度监听，通过访问值的方式，将当前watcher添加到依赖收集器当中
                traverse(value)
            }
            popTarget()
            //此时依赖收集已经完成 处理上一轮收集器的依赖项 替换收集器合集
            this.cleanupDeps()
        }
        return value
    }

    addDep(dep: Dep) {
        const id = dep.id
        if (!this.newDepIds.has(id)) {
            // 如果在新的收集器合集中没有当前dep，将这个dep放进新的合集中
            this.newDepIds.add(id)
            this.newDeps.push(dep)
            // 如果当前的watcher在上一轮的依赖收集中没有使用到这个数据，将这个watcher添加到这个数据dep上
            if (!this.depIds.has(id)) {
                dep.addSub(this)
            }
        }
    }

    cleanupDeps() {
        let i = this.deps.length
        while (i--) {
            const dep = this.deps[i]
            // 如果上一轮的依赖收集器合集中不存在这次数据更新后的的收集器合集中，说明当前的watcher没有依赖这个收集器对应的数据
            // 将这个watcher从数据的依赖收集器中删除，数据更新时不再需要通知这个watcher
            if (!this.newDepIds.has(dep.id)) {
                dep.removeSub(this)
            }
        }
        // 收集结束后，将新的收集器合集把上一轮的合集替换掉
        let tmp = this.depIds
        this.depIds = this.newDepIds
        this.newDepIds = tmp
        this.newDepIds.clear()
        tmp = this.deps
        this.deps = this.newDeps
        this.newDeps = tmp
        this.newDeps.length = 0
    }

    update() {
        if (this.lazy) {
            this.dirty = true
        } else if (this.sync) {
            // 如果是同步，则直接执行回调
            this.run()
        } else {
            // 异步执行回调，将watcher放入队列中
            queueWatcher(this)
        }
    }

    run() {
        if (this.active) {
            // 获取最新的值，此时又会进行依赖收集
            // 所以说，进行依赖收集有两个地方
            // 一个是在watcher进行初始化的时候
            // 一个是在依赖的数据发生变化的时候
            const value = this.get()

            if (value !== this.value || isObject(value) || this.deep) {
                const oldValue = this.value
                this.value = value
                // 执行回调函数
                if (this.user) {
                    try {
                        this.cb.call(this.vm, value, oldValue)
                    } catch (e) {
                        handleError(e, this.vm, `callback for watcher "${this.expression}"`)
                    }
                } else {
                    this.cb.call(this.vm, value, oldValue)
                }
            }
        }
    }

    evaluate() {
        this.value = this.get()
        this.dirty = false
    }

    depend() {
        let i = this.deps.length
        while (i--) {
            this.deps[i].depend()
        }
    }

    teardown() {
        if (this.active) {
            // remove self from vm's watcher list
            // this is a somewhat expensive operation so we skip it
            // if the vm is being destroyed.
            if (!this.vm._isBeingDestroyed) {
                remove(this.vm._watchers, this)
            }
            let i = this.deps.length
            while (i--) {
                this.deps[i].removeSub(this)
            }
            this.active = false
        }
    }
}
