/* @flow */

import {
    warn,
    nextTick,
    emptyObject,
    handleError,
    defineReactive,
} from "../util/index";

import { createElement } from "../vdom/create-element";
import { installRenderHelpers } from "./render-helpers/index";
import { resolveSlots } from "./render-helpers/resolve-slots";
import { normalizeScopedSlots } from "../vdom/helpers/normalize-scoped-slots";
import VNode, { createEmptyVNode } from "../vdom/vnode";

import { isUpdatingChildComponent } from "./lifecycle";

export function initRender(vm) {
    const options = vm.$options;

    vm._staticTrees = null;
    vm._vnode = null;
    vm.$vnode = options._parentVnode;

    const parentVnode = options._parentVnode;
    const renderContext = parentVnode && parentVnode.context;

    vm.$slots = resolveSlots(options._renderChildren, renderContext);
    vm.$scopedSlots = emptyObject;

    vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false);

    vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true);

    const parentData = parentVnode && parentVnode.data;

    defineReactive(
        vm,
        "$attrs",
        (parentData && parentData.attrs) || emptyObject,
        null,
        true
    );

    defineReactive(
        vm,
        "$listeners",
        options._parentListeners || emptyObject,
        null,
        true
    );
}

export let currentRenderingInstance: Component | null = null;

export function setCurrentRenderingInstance(vm: Component) {
    currentRenderingInstance = vm;
}

export function renderMixin(Vue) {
    installRenderHelpers(Vue.prototype);

    Vue.prototype.$nextTick = function (fn) {
        return nextTick(fn, this);
    };

    Vue.prototype._render = function () {
        const vm = this;
        const { render, _parentVnode } = vm.$options;

        vm.$vnode = _parentVnode;

        if (_parentVnode) {
            vm.$scopedSlots = normalizeScopedSlots(
                _parentVnode.data.scopedSlots,
                vm.$slots,
                vm.$scopedSlots
            );
        }

        currentRenderingInstance = vm;

        let vnode = render.call(vm._renderProxy, vm.$createElement);

        currentRenderingInstance = null;

        if (Array.isArray(vnode) && vnode.length === 1) {
            vnode = vnode[0];
        }
        if (!(vnode instanceof VNode)) {
            if (process.env.NODE_ENV !== "production" && Array.isArray(vnode)) {
                warn(
                    "Multiple root nodes returned from render function. Render function " +
                        "should return a single root node.",
                    vm
                );
            }
            vnode = createEmptyVNode();
        }

        vnode.parent = _parentVnode;
        return vnode;
    };
}
