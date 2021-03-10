/**
 * 1.选项合并函数
 * 2.序列化props、inject、directive工具函数
 * 3.选项合并策略函数
 *  a.data、provide返回一个闭包
 *  b.props、inject、methods、computed直接覆盖已有属性
 *  c.生命周期为一个函数数组
 *  d.静态资源（directives、filters、components）覆盖已有属性
 *
 * 总结如下：为一个对象的直接覆盖已有属性，data、provide产生一个闭包，生命周期在列表中追加回调函数
 * */

import config from '../config'
import { warn } from './debug'
import { set } from '../observer/index'
import { unicodeRegExp } from './lang'
import { nativeWatch, hasSymbol } from './env'

import { ASSET_TYPES, LIFECYCLE_HOOKS } from 'shared/constants'

import {
    extend,
    hasOwn,
    camelize,
    toRawType,
    capitalize,
    isBuiltInTag,
    isPlainObject
} from 'shared/util'

const strats = config.optionMergeStrategies

if (process.env.NODE_ENV !== 'production') {
    strats.el = strats.propsData = function (parent, child, vm, key) {
        if (!vm) {
            warn(
                `option "${key}" can only be used during instance ` +
                    'creation with the `new` keyword.'
            )
        }
        return defaultStrat(parent, child)
    }
}

/**
 * Helper that recursively merges two data objects together.
 */
function mergeData(to: Object, from: ?Object): Object {
    if (!from) return to
    let key, toVal, fromVal

    const keys = hasSymbol ? Reflect.ownKeys(from) : Object.keys(from)

    for (let i = 0; i < keys.length; i++) {
        key = keys[i]
        // in case the object is already observed...
        if (key === '__ob__') continue
        toVal = to[key]
        fromVal = from[key]
        if (!hasOwn(to, key)) {
            set(to, key, fromVal)
        } else if (toVal !== fromVal && isPlainObject(toVal) && isPlainObject(fromVal)) {
            mergeData(toVal, fromVal)
        }
    }
    return to
}

export function mergeDataOrFn(parentVal: any, childVal: any, vm?: Component): ?Function {
    if (!vm) {
        // in a Vue.extend merge, both should be functions
        if (!childVal) {
            return parentVal
        }
        if (!parentVal) {
            return childVal
        }

        return function mergedDataFn() {
            return mergeData(
                typeof childVal === 'function' ? childVal.call(this, this) : childVal,
                typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
            )
        }
    } else {
        return function mergedInstanceDataFn() {
            // instance merge
            const instanceData = typeof childVal === 'function' ? childVal.call(vm, vm) : childVal
            const defaultData = typeof parentVal === 'function' ? parentVal.call(vm, vm) : parentVal
            if (instanceData) {
                return mergeData(instanceData, defaultData)
            } else {
                return defaultData
            }
        }
    }
}

strats.data = function (parentVal: any, childVal: any, vm?: Component): ?Function {
    if (!vm) {
        if (childVal && typeof childVal !== 'function') {
            process.env.NODE_ENV !== 'production' &&
                warn(
                    'The "data" option should be a function ' +
                        'that returns a per-instance value in component ' +
                        'definitions.',
                    vm
                )

            return parentVal
        }
        return mergeDataOrFn(parentVal, childVal)
    }

    return mergeDataOrFn(parentVal, childVal, vm)
}

function mergeHook(
    parentVal: ?Array<Function>,
    childVal: ?Function | ?Array<Function>
): ?Array<Function> {
    const res = childVal
        ? parentVal
            ? parentVal.concat(childVal)
            : Array.isArray(childVal)
            ? childVal
            : [childVal]
        : parentVal
    return res ? dedupeHooks(res) : res
}

function dedupeHooks(hooks) {
    const res = []
    for (let i = 0; i < hooks.length; i++) {
        if (res.indexOf(hooks[i]) === -1) {
            res.push(hooks[i])
        }
    }
    return res
}

LIFECYCLE_HOOKS.forEach(hook => {
    strats[hook] = mergeHook
})

function mergeAssets(parentVal: ?Object, childVal: ?Object, vm?: Component, key: string): Object {
    const res = Object.create(parentVal || null)
    if (childVal) {
        process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)
        return extend(res, childVal)
    } else {
        return res
    }
}

ASSET_TYPES.forEach(function (type) {
    strats[type + 's'] = mergeAssets
})

strats.watch = function (
    parentVal: ?Object,
    childVal: ?Object,
    vm?: Component,
    key: string
): ?Object {
    // work around Firefox's Object.prototype.watch...
    if (parentVal === nativeWatch) parentVal = undefined
    if (childVal === nativeWatch) childVal = undefined
    /* istanbul ignore if */
    if (!childVal) return Object.create(parentVal || null)
    if (process.env.NODE_ENV !== 'production') {
        assertObjectType(key, childVal, vm)
    }
    if (!parentVal) return childVal
    const ret = {}
    extend(ret, parentVal)
    for (const key in childVal) {
        let parent = ret[key]
        const child = childVal[key]
        if (parent && !Array.isArray(parent)) {
            parent = [parent]
        }
        ret[key] = parent ? parent.concat(child) : Array.isArray(child) ? child : [child]
    }
    return ret
}

strats.props = strats.methods = strats.inject = strats.computed = function (
    parentVal: ?Object,
    childVal: ?Object,
    vm?: Component,
    key: string
): ?Object {
    if (childVal && process.env.NODE_ENV !== 'production') {
        assertObjectType(key, childVal, vm)
    }
    if (!parentVal) return childVal
    const ret = Object.create(null)
    extend(ret, parentVal)
    if (childVal) extend(ret, childVal)
    return ret
}
strats.provide = mergeDataOrFn

// 默认合并策略为子覆盖父
const defaultStrat = function (parentVal: any, childVal: any): any {
    return childVal === undefined ? parentVal : childVal
}

export function validateComponentName(name: string) {
    if (!new RegExp(`^[a-zA-Z][\\-\\.0-9_${unicodeRegExp.source}]*$`).test(name)) {
        warn(
            'Invalid component name: "' +
                name +
                '". Component names ' +
                'should conform to valid custom element name in html5 specification.'
        )
    }
    if (isBuiltInTag(name) || config.isReservedTag(name)) {
        warn('Do not use built-in or reserved HTML elements as component ' + 'id: ' + name)
    }
}

function normalizeProps(options: Object, vm: ?Component) {
    const props = options.props
    if (!props) return
    const res = {}
    let i, val, name
    if (Array.isArray(props)) {
        i = props.length
        while (i--) {
            val = props[i]
            if (typeof val === 'string') {
                name = camelize(val)
                res[name] = { type: null }
            }
        }
    } else if (isPlainObject(props)) {
        for (const key in props) {
            val = props[key]
            name = camelize(key)
            res[name] = isPlainObject(val) ? val : { type: val }
        }
    }
    options.props = res
}

function normalizeInject(options: Object, vm: ?Component) {
    const inject = options.inject
    if (!inject) return
    const normalized = (options.inject = {})
    if (Array.isArray(inject)) {
        for (let i = 0; i < inject.length; i++) {
            normalized[inject[i]] = { from: inject[i] }
        }
    } else if (isPlainObject(inject)) {
        for (const key in inject) {
            const val = inject[key]
            normalized[key] = isPlainObject(val) ? extend({ from: key }, val) : { from: val }
        }
    }
}

function normalizeDirectives(options: Object) {
    const dirs = options.directives
    if (dirs) {
        for (const key in dirs) {
            const def = dirs[key]
            if (typeof def === 'function') {
                dirs[key] = { bind: def, update: def }
            }
        }
    }
}

function assertObjectType(name: string, value: any, vm: ?Component) {
    if (!isPlainObject(value)) {
        warn(
            `Invalid value for option "${name}": expected an Object, ` +
                `but got ${toRawType(value)}.`,
            vm
        )
    }
}

export function mergeOptions(parent: Object, child: Object, vm?: Component): Object {
    if (typeof child === 'function') {
        child = child.options
    }

    //  序列化props，如果定义得props是一个数组，那么将数组中的字符串转换为驼峰形式，字段的def为{type:null}
    // 如果传入的是一个对象，字段的val为对象那么把这个对象作为字段的def，否则作为def的type值
    normalizeProps(child, vm)

    // 序列化inject，如果定义的是一个数组， 那么将数组中的字符串作为key，def的from为字符串值
    normalizeInject(child, vm)

    // 序列化指令，如果指令值为一个函数，那么将函数作为指令描述中bind和update的值，如果是一个对象，这个对象作为指令的描述
    normalizeDirectives(child)

    if (!child._base) {
        if (child.extends) {
            parent = mergeOptions(parent, child.extends, vm)
        }
        if (child.mixins) {
            // 将混入的mixin与默认选项合并，所以优先级为：默认->mixin->当前options
            for (let i = 0, l = child.mixins.length; i < l; i++) {
                parent = mergeOptions(parent, child.mixins[i], vm)
            }
        }
    }

    const options = {}
    let key
    for (key in parent) {
        mergeField(key)
    }
    for (key in child) {
        if (!hasOwn(parent, key)) {
            // 父级对象没有的属性
            mergeField(key)
        }
    }

    // mergeFiled可以访问options，strats，parent，child
    function mergeField(key) {
        const strat = strats[key] || defaultStrat
        options[key] = strat(parent[key], child[key], vm, key)
    }
    return options
}

export function resolveAsset(
    options: Object,
    type: string,
    id: string,
    warnMissing?: boolean
): any {
    /* istanbul ignore if */
    if (typeof id !== 'string') {
        return
    }
    const assets = options[type]
    // check local registration variations first
    if (hasOwn(assets, id)) return assets[id]
    const camelizedId = camelize(id)
    if (hasOwn(assets, camelizedId)) return assets[camelizedId]
    const PascalCaseId = capitalize(camelizedId)
    if (hasOwn(assets, PascalCaseId)) return assets[PascalCaseId]
    // fallback to prototype chain
    const res = assets[id] || assets[camelizedId] || assets[PascalCaseId]
    if (process.env.NODE_ENV !== 'production' && warnMissing && !res) {
        warn('Failed to resolve ' + type.slice(0, -1) + ': ' + id, options)
    }
    return res
}
