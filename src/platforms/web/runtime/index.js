/* @flow */

import Vue from "core/index";
import config from "core/config";
import { extend, noop } from "shared/util";
import { mountComponent } from "core/instance/lifecycle";
import { devtools, inBrowser } from "core/util/index";

import {
    query,
    mustUseProp,
    isReservedTag,
    isReservedAttr,
    getTagNamespace,
    isUnknownElement,
} from "web/util/index";

import { patch } from "./patch";
import platformDirectives from "./directives/index";
import platformComponents from "./components/index";

// install platform specific utils
Vue.config.mustUseProp = mustUseProp;
Vue.config.isReservedTag = isReservedTag;
Vue.config.isReservedAttr = isReservedAttr;
Vue.config.getTagNamespace = getTagNamespace;
Vue.config.isUnknownElement = isUnknownElement;

extend(Vue.options.directives, platformDirectives); // model和show指令
extend(Vue.options.components, platformComponents); // Transition和TransitionGroup组件

Vue.prototype.__patch__ = inBrowser ? patch : noop;

Vue.prototype.$mount = function (el, hydrating) {
    el = el && inBrowser ? query(el) : undefined;

    const vm = this;
    // 初始化$el属性
    vm.$el = el;

    !vm.$options.render && (vm.$options.render = createEmptyVNode);

    // 触发生命周期钩子
    callHook(vm, "beforeMount");

    // 创建watcher
    new Watcher(
        vm,
        () => {
            vm._update(vm._render(), hydrating);
        },
        noop,
        {
            before() {
                if (vm._isMounted && !vm._isDestroyed) {
                    callHook(vm, "beforeUpdate");
                }
            },
        },
        true
    );
    hydrating = false;

    // 触发生命周期钩子
    if (vm.$vnode == null) {
        vm._isMounted = true;
        callHook(vm, "mounted");
    }
    return vm;
};

export default Vue;
