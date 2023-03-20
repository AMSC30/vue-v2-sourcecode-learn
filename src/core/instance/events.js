/* @flow */

import {
    tip,
    toArray,
    hyphenate,
    formatComponentName,
    invokeWithErrorHandling,
} from "../util/index";
import { updateListeners } from "../vdom/helpers/index";

export function initEvents(vm: Component) {
    vm._events = Object.create(null);
    vm._hasHookEvent = false;
    // init parent attached events
    const listeners = vm.$options._parentListeners;
    if (listeners) {
        updateComponentListeners(vm, listeners);
    }
}

let target: any;

function add(event, fn) {
    target.$on(event, fn);
}

function remove(event, fn) {
    target.$off(event, fn);
}

function createOnceHandler(event, fn) {
    const _target = target;
    return function onceHandler() {
        const res = fn.apply(null, arguments);
        if (res !== null) {
            _target.$off(event, onceHandler);
        }
    };
}

export function updateComponentListeners(
    vm: Component,
    listeners: Object,
    oldListeners: ?Object
) {
    target = vm;
    updateListeners(
        listeners,
        oldListeners || {},
        add,
        remove,
        createOnceHandler,
        vm
    );
    target = undefined;
}

export function eventsMixin(Vue: Class<Component>) {
    Vue.prototype.$on = function (event, fn) {
        if (Array.isArray(event)) {
            for (let i = 0, l = event.length; i < l; i++) {
                this.$on(event[i], fn);
            }
        } else {
            (this._events[event] || (this._events[event] = [])).push(fn);

            // 以hook:开头的事件名
            if (/^hook:/.test(event)) {
                this._hasHookEvent = true;
            }
        }
        return this;
    };

    Vue.prototype.$once = function (event, fn) {
        const vm = this;
        function on() {
            vm.$off(event, on);
            fn.apply(vm, arguments);
        }
        on.fn = fn;
        vm.$on(event, on);
        return vm;
    };

    Vue.prototype.$off = function (event, fn) {
        const vm = this;

        // 如果不传入参数，注销所有的事件回调，将_events属性置为一个空的对象
        if (!arguments.length) {
            vm._events = Object.create(null);
            return vm;
        }

        // 传入的是一个数组，迭代注销事件
        if (Array.isArray(event)) {
            for (let i = 0, l = event.length; i < l; i++) {
                vm.$off(event[i], fn);
            }
            return vm;
        }

        const cbs = vm._events[event];
        if (!cbs) {
            return vm;
        }

        // 如果不传入，取消事件的所有回调，置为null
        if (!fn) {
            vm._events[event] = null;
            return vm;
        }

        let cb;
        let i = cbs.length;
        while (i--) {
            cb = cbs[i];
            if (cb === fn || cb.fn === fn) {
                cbs.splice(i, 1);
                break;
            }
        }
        return vm;
    };

    Vue.prototype.$emit = function (event) {
        const vm = this;

        let cbs = vm._events[event];

        if (cbs) {
            cbs = cbs.length > 1 ? toArray(cbs) : cbs;
            const args = toArray(arguments, 1);
            const info = `event handler for "${event}"`;
            for (let i = 0, l = cbs.length; i < l; i++) {
                invokeWithErrorHandling(cbs[i], vm, args, vm, info);
            }
        }
        return vm;
    };
}