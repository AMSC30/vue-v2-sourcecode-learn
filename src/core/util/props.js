/* @flow */

import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import { hasOwn, isObject, toRawType, hyphenate, capitalize, isPlainObject } from 'shared/util'

type PropOptions = {
    type: Function | Array<Function> | null,
    default: any,
    required: ?boolean,
    validator: ?Function
}

export function validateProp(
    key: string,
    propOptions: Object,
    propsData: Object,
    vm?: Component
): any {
    const prop = propOptions[key]
    // 能否从propsData中获取到值，propsData是从父组件中获取到的
    const absent = !hasOwn(propsData, key)
    let value = propsData[key]

    // 标识我们需要的类型有没有布尔类型
    const booleanIndex = getTypeIndex(Boolean, prop.type)

    // 需要布尔类型
    if (booleanIndex > -1) {
        if (absent && !hasOwn(prop, 'default')) {
            // 无法从父组件中获取到，同时没有定义default，值默认为false
            value = false
        } else if (value === '' || value === hyphenate(key)) {
            const stringIndex = getTypeIndex(String, prop.type)
            if (stringIndex < 0 || booleanIndex < stringIndex) {
                value = true
            }
        }
    }

    if (value === undefined) {
        // 没有在父组件中获取到值，返回默认值
        value = getPropDefaultValue(vm, prop, key)
        const prevShouldObserve = shouldObserve
        toggleObserving(true)
        observe(value)
        toggleObserving(prevShouldObserve)
    }

    if (
        process.env.NODE_ENV !== 'production' &&
        !(__WEEX__ && isObject(value) && '@binding' in value)
    ) {
        assertProp(prop, key, value, vm, absent)
    }
    return value
}

/**
 * Get the default value of a prop.
 */
function getPropDefaultValue(vm: ?Component, prop: PropOptions, key: string): any {
    // no default, return undefined
    if (!hasOwn(prop, 'default')) {
        return undefined
    }
    const def = prop.default
    // warn against non-factory defaults for Object & Array
    if (process.env.NODE_ENV !== 'production' && isObject(def)) {
        warn(
            'Invalid default value for prop "' +
                key +
                '": ' +
                'Props with type Object/Array must use a factory function ' +
                'to return the default value.',
            vm
        )
    }
    // the raw prop value was also undefined from previous render,
    // return previous default value to avoid unnecessary watcher trigger
    if (
        vm &&
        vm.$options.propsData &&
        vm.$options.propsData[key] === undefined &&
        vm._props[key] !== undefined
    ) {
        return vm._props[key]
    }
    // call factory function for non-Function types
    // a value is Function if its prototype is function even across different execution context
    return typeof def === 'function' && getType(prop.type) !== 'Function' ? def.call(vm) : def
}

/**
 * Assert whether a prop is valid.
 */
function assertProp(prop: PropOptions, name: string, value: any, vm: ?Component, absent: boolean) {
    if (prop.required && absent) {
        warn('Missing required prop: "' + name + '"', vm)
        return
    }
    if (value == null && !prop.required) {
        return
    }
    let type = prop.type
    let valid = !type || type === true
    const expectedTypes = []
    if (type) {
        if (!Array.isArray(type)) {
            type = [type]
        }
        for (let i = 0; i < type.length && !valid; i++) {
            const assertedType = assertType(value, type[i])
            expectedTypes.push(assertedType.expectedType || '')
            valid = assertedType.valid
        }
    }

    if (!valid) {
        warn(getInvalidTypeMessage(name, value, expectedTypes), vm)
        return
    }
    const validator = prop.validator
    if (validator) {
        if (!validator(value)) {
            warn('Invalid prop: custom validator check failed for prop "' + name + '".', vm)
        }
    }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol)$/

function assertType(
    value: any,
    type: Function
): {
    valid: boolean,
    expectedType: string
} {
    let valid
    const expectedType = getType(type)
    if (simpleCheckRE.test(expectedType)) {
        const t = typeof value
        valid = t === expectedType.toLowerCase()
        // for primitive wrapper objects
        if (!valid && t === 'object') {
            valid = value instanceof type
        }
    } else if (expectedType === 'Object') {
        valid = isPlainObject(value)
    } else if (expectedType === 'Array') {
        valid = Array.isArray(value)
    } else {
        valid = value instanceof type
    }
    return {
        valid,
        expectedType
    }
}

function getType(fn) {
    const match = fn && fn.toString().match(/^\s*function (\w+)/)
    return match ? match[1] : ''
}

function isSameType(a, b) {
    return getType(a) === getType(b)
}

function getTypeIndex(type, expectedTypes): number {
    if (!Array.isArray(expectedTypes)) {
        return isSameType(expectedTypes, type) ? 0 : -1
    }
    for (let i = 0, len = expectedTypes.length; i < len; i++) {
        if (isSameType(expectedTypes[i], type)) {
            return i
        }
    }
    return -1
}

function getInvalidTypeMessage(name, value, expectedTypes) {
    let message =
        `Invalid prop: type check failed for prop "${name}".` +
        ` Expected ${expectedTypes.map(capitalize).join(', ')}`
    const expectedType = expectedTypes[0]
    const receivedType = toRawType(value)
    const expectedValue = styleValue(value, expectedType)
    const receivedValue = styleValue(value, receivedType)
    // check if we need to specify expected value
    if (
        expectedTypes.length === 1 &&
        isExplicable(expectedType) &&
        !isBoolean(expectedType, receivedType)
    ) {
        message += ` with value ${expectedValue}`
    }
    message += `, got ${receivedType} `
    // check if we need to specify received value
    if (isExplicable(receivedType)) {
        message += `with value ${receivedValue}.`
    }
    return message
}

function styleValue(value, type) {
    if (type === 'String') {
        return `"${value}"`
    } else if (type === 'Number') {
        return `${Number(value)}`
    } else {
        return `${value}`
    }
}

function isExplicable(value) {
    const explicitTypes = ['string', 'number', 'boolean']
    return explicitTypes.some(elem => value.toLowerCase() === elem)
}

function isBoolean(...args) {
    return args.some(elem => elem.toLowerCase() === 'boolean')
}
