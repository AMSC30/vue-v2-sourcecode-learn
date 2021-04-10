/* @flow */

import { warn, nextTick, emptyObject, handleError, defineReactive } from '../util/index'

import { createElement } from '../vdom/create-element'
import { installRenderHelpers } from './render-helpers/index'
import { resolveSlots } from './render-helpers/resolve-slots'
import { normalizeScopedSlots } from '../vdom/helpers/normalize-scoped-slots'
import VNode, { createEmptyVNode } from '../vdom/vnode'

import { isUpdatingChildComponent } from './lifecycle'

export function initRender(vm: Component) {
    vm._vnode = null // the root of the child tree
    vm._staticTrees = null // v-once cached trees

    const options = vm.$options
    const parentVnode = (vm.$vnode = options._parentVnode) // the placeholder node in parent tree
    const renderContext = parentVnode && parentVnode.context

    vm.$slots = resolveSlots(options._renderChildren, renderContext)
    vm.$scopedSlots = emptyObject

    vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)

    vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

    const parentData = parentVnode && parentVnode.data

    if (process.env.NODE_ENV !== 'production') {
        defineReactive(
            vm,
            '$attrs',
            (parentData && parentData.attrs) || emptyObject,
            () => {
                !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
            },
            true
        )
        defineReactive(
            vm,
            '$listeners',
            options._parentListeners || emptyObject,
            () => {
                !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
            },
            true
        )
    } else {
        defineReactive(vm, '$attrs', (parentData && parentData.attrs) || emptyObject, null, true)
        defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
    }
}

export let currentRenderingInstance: Component | null = null

// for testing only
export function setCurrentRenderingInstance(vm: Component) {
    currentRenderingInstance = vm
}

export function renderMixin(Vue: Class<Component>) {
    // install runtime convenience helpers
    installRenderHelpers(Vue.prototype)

    Vue.prototype.$nextTick = function (fn: Function) {
        return nextTick(fn, this)
    }

    Vue.prototype._render = function (): VNode {
        const vm: Component = this
        const { render, _parentVnode } = vm.$options

        if (_parentVnode) {
            vm.$scopedSlots = normalizeScopedSlots(
                _parentVnode.data.scopedSlots,
                vm.$slots,
                vm.$scopedSlots
            )
        }

        vm.$vnode = _parentVnode

        currentRenderingInstance = vm

        let vnode = render.call(vm._renderProxy, vm.$createElement)

        currentRenderingInstance = null

        if (Array.isArray(vnode) && vnode.length === 1) {
            vnode = vnode[0]
        }
        if (!(vnode instanceof VNode)) {
            if (process.env.NODE_ENV !== 'production' && Array.isArray(vnode)) {
                warn(
                    'Multiple root nodes returned from render function. Render function ' +
                        'should return a single root node.',
                    vm
                )
            }
            vnode = createEmptyVNode()
        }

        vnode.parent = _parentVnode
        return vnode
    }
}
