/* @flow */

import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions } from '../util/index'

let uid = 0

export function initMixin(Vue: Class<Component>) {
    Vue.prototype._init = function (options?: Object) {
        const vm: Component = this

        vm._uid = uid++

        vm._isVue = true

        // 合并默认选项和用户传入的选项
        if (options && options._isComponent) {
            initInternalComponent(vm, options)
        } else {
            // 初始化实例选项
            // 将构造函数上的options选项合传入的options进行合并挂载到实例的$options属性上
            // 1.将props等属性进行序列化成规范的格式
            // 2.将extend、mixins先进行合并
            // 3.根据合并策略进行合并：data的合并（成为一个函数）、watch的合并（成为一个数组）、生命周期的合并（成为一个数组）、其他选项的合并（子属性覆盖父属性）
            vm.$options = mergeOptions(resolveConstructorOptions(vm.constructor), options || {}, vm)
        }

        vm._renderProxy = vm
        vm._self = vm

        // 初始化组件关系变量，生命周期状态变量
        initLifecycle(vm)

        // 初始化事件容器、hook事件标记
        initEvents(vm)

        // 初始化渲染相关
        initRender(vm)

        // 至此，实例的选项序列化完成、选项合并完成、组件关系及相关渲染更新方法赋值完成
        callHook(vm, 'beforeCreate')

        // 开始初始化数据

        // 初始化inject，不断向上查找实例的provide
        initInjections(vm)

        // 初始化props、methods、data、computed、watch
        initState(vm)

        // 初始化实例的_provide属性，可以为一个函数的形式
        initProvide(vm)

        callHook(vm, 'created')

        if (vm.$options.el) {
            vm.$mount(vm.$options.el)
        }
    }
}

export function initInternalComponent(vm: Component, options: InternalComponentOptions) {
    const opts = (vm.$options = Object.create(vm.constructor.options))
    // doing this because it's faster than dynamic enumeration.
    const parentVnode = options._parentVnode
    opts.parent = options.parent
    opts._parentVnode = parentVnode

    const vnodeComponentOptions = parentVnode.componentOptions
    opts.propsData = vnodeComponentOptions.propsData
    opts._parentListeners = vnodeComponentOptions.listeners
    opts._renderChildren = vnodeComponentOptions.children
    opts._componentTag = vnodeComponentOptions.tag

    if (options.render) {
        opts.render = options.render
        opts.staticRenderFns = options.staticRenderFns
    }
}

export function resolveConstructorOptions(Ctor: Class<Component>) {
    let options = Ctor.options
    if (Ctor.super) {
        const superOptions = resolveConstructorOptions(Ctor.super)
        const cachedSuperOptions = Ctor.superOptions
        if (superOptions !== cachedSuperOptions) {
            // super option changed,
            // need to resolve new options.
            Ctor.superOptions = superOptions
            // check if there are any late-modified/attached options (#4976)
            const modifiedOptions = resolveModifiedOptions(Ctor)
            // update base extend options
            if (modifiedOptions) {
                extend(Ctor.extendOptions, modifiedOptions)
            }
            options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
            if (options.name) {
                options.components[options.name] = Ctor
            }
        }
    }
    return options
}

function resolveModifiedOptions(Ctor: Class<Component>): ?Object {
    let modified
    const latest = Ctor.options
    const sealed = Ctor.sealedOptions
    for (const key in latest) {
        if (latest[key] !== sealed[key]) {
            if (!modified) modified = {}
            modified[key] = latest[key]
        }
    }
    return modified
}
