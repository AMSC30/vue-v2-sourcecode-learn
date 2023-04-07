/* @flow */

import VNode from "./vnode";
import { resolveConstructorOptions } from "core/instance/init";
import { queueActivatedComponent } from "core/observer/scheduler";
import { createFunctionalComponent } from "./create-functional-component";

import { warn, isDef, isUndef, isTrue, isObject } from "../util/index";

import {
    resolveAsyncComponent,
    createAsyncPlaceholder,
    extractPropsFromVNodeData,
} from "./helpers/index";

import {
    callHook,
    activeInstance,
    updateChildComponent,
    activateChildComponent,
    deactivateChildComponent,
} from "../instance/lifecycle";

import {
    isRecyclableComponent,
    renderRecyclableComponentTemplate,
} from "weex/runtime/recycle-list/render-component-template";

// inline hooks to be invoked on component VNodes during patch
const componentVNodeHooks = {
    init(vnode, hydrating) {
        if (
            vnode.componentInstance &&
            !vnode.componentInstance._isDestroyed &&
            vnode.data.keepAlive
        ) {
            componentVNodeHooks.prepatch(vnode, vnode);
        } else {
            const child = (vnode.componentInstance =
                createComponentInstanceForVnode(vnode, activeInstance));
            child.$mount(hydrating ? vnode.elm : undefined, hydrating);
        }
    },

    prepatch(oldVnode, vnode) {
        const options = vnode.componentOptions;
        const child = (vnode.componentInstance = oldVnode.componentInstance);
        updateChildComponent(
            child,
            options.propsData, // updated props
            options.listeners, // updated listeners
            vnode, // new parent vnode
            options.children // new children
        );
    },

    insert(vnode) {
        const { context, componentInstance } = vnode;
        if (!componentInstance._isMounted) {
            componentInstance._isMounted = true;
            callHook(componentInstance, "mounted");
        }
        if (vnode.data.keepAlive) {
            if (context._isMounted) {
                // vue-router#1212
                // During updates, a kept-alive component's child components may
                // change, so directly walking the tree here may call activated hooks
                // on incorrect children. Instead we push them into a queue which will
                // be processed after the whole patch process ended.
                queueActivatedComponent(componentInstance);
            } else {
                activateChildComponent(componentInstance, true /* direct */);
            }
        }
    },

    destroy(vnode) {
        const { componentInstance } = vnode;
        if (!componentInstance._isDestroyed) {
            if (!vnode.data.keepAlive) {
                componentInstance.$destroy();
            } else {
                deactivateChildComponent(componentInstance, true);
            }
        }
    },
};

const hooksToMerge = Object.keys(componentVNodeHooks);

export function createComponent(Ctor, data, context, children, tag) {
    const baseCtor = context.$options._base;

    isObject(Ctor) && (Ctor = baseCtor.extend(Ctor));

    let asyncFactory;
    // 异步组件
    if (isUndef(Ctor.cid)) {
        asyncFactory = Ctor;
        // 解析异步组件
        Ctor = resolveAsyncComponent(asyncFactory, baseCtor);
        if (Ctor === undefined) {
            return createAsyncPlaceholder(
                asyncFactory,
                data,
                context,
                children,
                tag
            );
        }
    }

    data = data || {};

    // 合并各层级options
    resolveConstructorOptions(Ctor);

    // 处理组件上的v-model，处理为数据绑定和事件绑定
    isDef(data.model) && transformModel(Ctor.options, data);

    const propsData = extractPropsFromVNodeData(data, Ctor, tag);

    // 函数式组件
    if (isTrue(Ctor.options.functional)) {
        return createFunctionalComponent(
            Ctor,
            propsData,
            data,
            context,
            children
        );
    }

    const listeners = data.on;

    data.on = data.nativeOn;

    if (isTrue(Ctor.options.abstract)) {
        const slot = data.slot;
        data = {};
        if (slot) {
            data.slot = slot;
        }
    }

    installComponentHooks(data);

    // return a placeholder vnode
    const name = Ctor.options.name || tag;
    const vnode = new VNode(
        `vue-component-${Ctor.cid}${name ? `-${name}` : ""}`,
        data,
        undefined,
        undefined,
        undefined,
        context,
        { Ctor, propsData, listeners, tag, children },
        asyncFactory
    );

    return vnode;
}

export function createComponentInstanceForVnode(vnode, parent) {
    const options = {
        _isComponent: true,
        _parentVnode: vnode,
        parent,
    };
    // check inline-template render functions
    const inlineTemplate = vnode.data.inlineTemplate;
    if (isDef(inlineTemplate)) {
        options.render = inlineTemplate.render;
        options.staticRenderFns = inlineTemplate.staticRenderFns;
    }
    return new vnode.componentOptions.Ctor(options);
}

function installComponentHooks(data) {
    const hooks = data.hook || (data.hook = {});
    for (let i = 0; i < hooksToMerge.length; i++) {
        const key = hooksToMerge[i];
        const existing = hooks[key];
        const toMerge = componentVNodeHooks[key];
        if (existing !== toMerge && !(existing && existing._merged)) {
            hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge;
        }
    }
}

function mergeHook(f1: any, f2: any): Function {
    const merged = (a, b) => {
        // flow complains about extra args which is why we use any
        f1(a, b);
        f2(a, b);
    };
    merged._merged = true;
    return merged;
}

function transformModel(options, data) {
    // prop,value,event,callback
    const prop = (options.model && options.model.prop) || "value";
    const event = (options.model && options.model.event) || "input";
    (data.attrs || (data.attrs = {}))[prop] = data.model.value;
    const on = data.on || (data.on = {});
    const existing = on[event];
    const callback = data.model.callback;
    if (isDef(existing)) {
        if (
            Array.isArray(existing)
                ? existing.indexOf(callback) === -1
                : existing !== callback
        ) {
            on[event] = [callback].concat(existing);
        }
    } else {
        on[event] = callback;
    }
}
