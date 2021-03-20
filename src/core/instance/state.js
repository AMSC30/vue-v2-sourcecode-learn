/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import { set, del, observe, defineReactive, toggleObserving } from '../observer/index'

import {
    warn,
    bind,
    noop,
    hasOwn,
    hyphenate,
    isReserved,
    handleError,
    nativeWatch,
    validateProp,
    isPlainObject,
    isServerRendering,
    isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
    enumerable: true,
    configurable: true,
    get: noop,
    set: noop
}

export function proxy(target: Object, sourceKey: string, key: string) {
    sharedPropertyDefinition.get = function proxyGetter() {
        return this[sourceKey][key]
    }
    sharedPropertyDefinition.set = function proxySetter(val) {
        this[sourceKey][key] = val
    }
    Object.defineProperty(target, key, sharedPropertyDefinition)
}

export function initState(vm: Component) {
    // watcher储存池
    vm._watchers = []

    const opts = vm.$options

    // 初始化vue实例的_props属性值，并将属性的访问代理到vue实例上面
    if (opts.props) initProps(vm, opts.props)

    // 校验命名冲突和值类型，将方法挂载到vue实例上面
    if (opts.methods) initMethods(vm, opts.methods)

    if (opts.data) {
        // 属性名校验、访问代理实现、数据响应式处理
        initData(vm)
    } else {
        observe((vm._data = {}), true)
    }

    // 本质上根据每个属性生成一个watcher保存在vue实例的_computedWatchers中，再创建对象属性的访问描述，同时将每个属性挂载到vue实例上
    if (opts.computed) initComputed(vm, opts.computed)

    if (opts.watch && opts.watch !== nativeWatch) {
        initWatch(vm, opts.watch)
    }
}

function initProps(vm: Component, propsOptions: Object) {
    // 从父组件上获取到值，并生成_props对象，进行响应式处理，并对该属性进行代理，实现可以通过vue实例属性访问
    const propsData = vm.$options.propsData || {}
    const keys = (vm.$options._propKeys = [])
    const props = (vm._props = {})

    const isRoot = !vm.$parent

    if (!isRoot) {
        toggleObserving(false)
    }

    for (const key in propsOptions) {
        keys.push(key)
        // 获取到值
        const value = validateProp(key, propsOptions, propsData, vm)
        // 响应式处理
        defineReactive(props, key, value)
        // 访问代理
        if (!(key in vm)) {
            proxy(vm, `_props`, key)
        }
    }
    toggleObserving(true)
}

function initData(vm: Component) {
    let data = vm.$options.data
    // 在vue实例上挂载_data属性
    data = vm._data = typeof data === 'function' ? getData(data, vm) : data || {}

    // data必须是一个对象
    if (!isPlainObject(data)) {
        data = {}
        process.env.NODE_ENV !== 'production' &&
            warn(
                'data functions should return an object:\n' +
                    'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
                vm
            )
    }

    const keys = Object.keys(data)
    const props = vm.$options.props
    const methods = vm.$options.methods
    let i = keys.length

    // data属性名进行校验，不能再props和methods出现， methods的属性名不能在props中出现
    while (i--) {
        const key = keys[i]
        if (process.env.NODE_ENV !== 'production') {
            if (methods && hasOwn(methods, key)) {
                warn(`Method "${key}" has already been defined as a data property.`, vm)
            }
        }
        if (props && hasOwn(props, key)) {
            process.env.NODE_ENV !== 'production' &&
                warn(
                    `The data property "${key}" is already declared as a prop. ` +
                        `Use prop default value instead.`,
                    vm
                )
        } else if (!isReserved(key)) {
            // 将_data代理到vue实例上
            proxy(vm, `_data`, key)
        }
    }
    // 数据响应式处理
    observe(data, true)
}

export function getData(data: Function, vm: Component): any {
    // #7573 disable dep collection when invoking data getters
    pushTarget()
    try {
        return data.call(vm, vm)
    } catch (e) {
        handleError(e, vm, `data()`)
        return {}
    } finally {
        popTarget()
    }
}

const computedWatcherOptions = { lazy: true }

function initComputed(vm: Component, computed: Object) {
    // 初始化vue实例的_computedWatchers，是一个对象，对应每一个computed的watcher
    const watchers = (vm._computedWatchers = Object.create(null))
    const isSSR = isServerRendering()

    for (const key in computed) {
        const userDef = computed[key]
        // computed如果是一个函数，该函数作为getter，如果是一个对象，get属性值作为getter
        const getter = typeof userDef === 'function' ? userDef : userDef.get

        // 开发环境下校验是否有getter
        if (process.env.NODE_ENV !== 'production' && getter == null) {
            warn(`Getter is missing for computed property "${key}".`, vm)
        }

        //
        if (!isSSR) {
            // 每一个计算属性对应一个watcher，放在_computedWatchers中
            watchers[key] = new Watcher(vm, getter || noop, noop, computedWatcherOptions)
        }

        if (!(key in vm)) {
            defineComputed(vm, key, userDef)
        } else if (process.env.NODE_ENV !== 'production') {
            if (key in vm.$data) {
                warn(`The computed property "${key}" is already defined in data.`, vm)
            } else if (vm.$options.props && key in vm.$options.props) {
                warn(`The computed property "${key}" is already defined as a prop.`, vm)
            }
        }
    }
}

export function defineComputed(target: any, key: string, userDef: Object | Function) {
    const shouldCache = !isServerRendering()
    if (typeof userDef === 'function') {
        sharedPropertyDefinition.get = shouldCache
            ? createComputedGetter(key)
            : createGetterInvoker(userDef)
        sharedPropertyDefinition.set = noop
    } else {
        sharedPropertyDefinition.get = userDef.get
            ? shouldCache && userDef.cache !== false
                ? createComputedGetter(key)
                : createGetterInvoker(userDef.get)
            : noop
        sharedPropertyDefinition.set = userDef.set || noop
    }
    if (process.env.NODE_ENV !== 'production' && sharedPropertyDefinition.set === noop) {
        sharedPropertyDefinition.set = function () {
            warn(`Computed property "${key}" was assigned to but it has no setter.`, this)
        }
    }
    Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter(key) {
    return function computedGetter() {
        const watcher = this._computedWatchers && this._computedWatchers[key]
        if (watcher) {
            if (watcher.dirty) {
                watcher.evaluate()
            }
            if (Dep.target) {
                watcher.depend()
            }
            return watcher.value
        }
    }
}

function createGetterInvoker(fn) {
    return function computedGetter() {
        return fn.call(this, this)
    }
}

function initMethods(vm: Component, methods: Object) {
    const props = vm.$options.props
    for (const key in methods) {
        if (process.env.NODE_ENV !== 'production') {
            // 校验methods值的类型
            if (typeof methods[key] !== 'function') {
                warn(
                    `Method "${key}" has type "${typeof methods[
                        key
                    ]}" in the component definition. ` +
                        `Did you reference the function correctly?`,
                    vm
                )
            }
            // 函数名是否与props中属性冲突
            if (props && hasOwn(props, key)) {
                warn(`Method "${key}" has already been defined as a prop.`, vm)
            }
            if (key in vm && isReserved(key)) {
                warn(
                    `Method "${key}" conflicts with an existing Vue instance method. ` +
                        `Avoid defining component methods that start with _ or $.`
                )
            }
        }
        // 将方法挂载到vue实例上，如果methods各个属性值不是一个函数返回一个空的函数，否则将函数的this绑定到vue实例上
        vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
    }
}

function initWatch(vm: Component, watch: Object) {
    // 遍历定义得watch选项
    for (const key in watch) {
        // 拿到每个选项值
        const handler = watch[key]
        // 如果watch是一个数组，为每一项创建一个watcher并放入vue实例的_watchers中
        if (Array.isArray(handler)) {
            for (let i = 0; i < handler.length; i++) {
                createWatcher(vm, key, handler[i])
            }
        } else {
            createWatcher(vm, key, handler)
        }
    }
}

function createWatcher(vm: Component, expOrFn: string | Function, handler: any, options?: Object) {
    // 序列化传过来的参数，统一为exp、handler、options
    if (isPlainObject(handler)) {
        options = handler
        handler = handler.handler
    }
    // 如果定义的handler是一个字符串，那么handler从vue实例的方法上取得
    if (typeof handler === 'string') {
        handler = vm[handler]
    }
    // 调用$watch方法
    return vm.$watch(expOrFn, handler, options)
}

export function stateMixin(Vue: Class<Component>) {
    // $data属性描述器
    const dataDef = {}
    dataDef.get = function () {
        return this._data
    }

    // $props属性描述器
    const propsDef = {}
    propsDef.get = function () {
        return this._props
    }
    // 访问实例的this.$data返回实例的_data属性，_data是在init中赋值的
    Object.defineProperty(Vue.prototype, '$data', dataDef)

    // 访问实例的this.$props返回实例的_prop属性,_props是在init中赋值的
    Object.defineProperty(Vue.prototype, '$props', propsDef)

    // 在原型对象上声明$set、$delete方法
    Vue.prototype.$set = set
    Vue.prototype.$delete = del

    // 在原型对象上声明$watch方法
    Vue.prototype.$watch = function (
        expOrFn: string | Function,
        cb: any,
        options?: Object
    ): Function {
        const vm: Component = this

        if (isPlainObject(cb)) {
            return createWatcher(vm, expOrFn, cb, options)
        }

        options = options || {}
        options.user = true

        const watcher = new Watcher(vm, expOrFn, cb, options)

        if (options.immediate) {
            try {
                cb.call(vm, watcher.value)
            } catch (error) {
                handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
            }
        }

        return function unwatchFn() {
            watcher.teardown()
        }
    }
}
