/* @flow */

import { hasOwn } from 'shared/util'
import { warn, hasSymbol } from '../util/index'
import { defineReactive, toggleObserving } from '../observer/index'

export function initProvide(vm: Component) {
    const provide = vm.$options.provide
    if (provide) {
        // provide可以为一个返回对象的函数形式
        vm._provided = typeof provide === 'function' ? provide.call(vm) : provide
    }
}

export function initInjections(vm: Component) {
    // 根据inject选项，从当前实例触发，获取inject对象
    const result = resolveInject(vm.$options.inject, vm)

    // 如果存在inject，做响应式处理
    if (result) {
        toggleObserving(false)
        Object.keys(result).forEach(key => {
            /* istanbul ignore else */
            if (process.env.NODE_ENV !== 'production') {
                defineReactive(vm, key, result[key], () => {
                    warn(
                        `Avoid mutating an injected value directly since the changes will be ` +
                            `overwritten whenever the provided component re-renders. ` +
                            `injection being mutated: "${key}"`,
                        vm
                    )
                })
            } else {
                defineReactive(vm, key, result[key])
            }
        })
        toggleObserving(true)
    }
}

export function resolveInject(inject: any, vm: Component): ?Object {
    if (inject) {
        // 创建一个空实例
        const result = Object.create(null)
        const keys = hasSymbol ? Reflect.ownKeys(inject) : Object.keys(inject)

        for (let i = 0; i < keys.length; i++) {
            // 拿到key值
            const key = keys[i]

            if (key === '__ob__') continue

            // 拿到来源的key
            const provideKey = inject[key].from

            let source = vm

            while (source) {
                // 从当前实例的provide开始查找from对应的值
                if (source._provided && hasOwn(source._provided, provideKey)) {
                    result[key] = source._provided[provideKey]
                    break
                }
                source = source.$parent
            }
            if (!source) {
                // 可以在from后面指定一个default
                if ('default' in inject[key]) {
                    const provideDefault = inject[key].default
                    result[key] =
                        typeof provideDefault === 'function'
                            ? provideDefault.call(vm)
                            : provideDefault
                } else if (process.env.NODE_ENV !== 'production') {
                    warn(`Injection "${key}" not found`, vm)
                }
            }
        }
        return result
    }
}
