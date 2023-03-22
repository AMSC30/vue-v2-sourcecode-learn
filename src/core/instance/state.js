/* @flow */

import config from "../config";
import Watcher from "../observer/watcher";
import Dep, { pushTarget, popTarget } from "../observer/dep";
import { isUpdatingChildComponent } from "./lifecycle";

import {
    set,
    del,
    observe,
    defineReactive,
    toggleObserving,
} from "../observer/index";

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
    isReservedAttribute,
} from "../util/index";

const sharedPropertyDefinition = {
    enumerable: true,
    configurable: true,
    get: noop,
    set: noop,
};

export function proxy(target, sourceKey, key) {
    sharedPropertyDefinition.get = function proxyGetter() {
        return this[sourceKey][key];
    };
    sharedPropertyDefinition.set = function proxySetter(val) {
        this[sourceKey][key] = val;
    };
    Object.defineProperty(target, key, sharedPropertyDefinition);
}

export function initState(vm) {
    vm._watchers = [];

    const opts = vm.$options;

    opts.props && initProps(vm, opts.props);

    opts.methods && initMethods(vm, opts.methods);

    opts.data ? initData(vm) : observe((vm._data = {}), true);

    opts.computed && initComputed(vm, opts.computed);

    if (opts.watch && opts.watch !== nativeWatch) {
        initWatch(vm, opts.watch);
    }
}

function initProps(vm, propsOptions) {
    const propsData = vm.$options.propsData || {};
    const keys = (vm.$options._propKeys = []);
    const props = (vm._props = {});

    vm.$parent && toggleObserving(false);

    for (const key in propsOptions) {
        keys.push(key);
        // 获取到值
        const value = validateProp(key, propsOptions, propsData, vm);
        // 响应式处理
        defineReactive(props, key, value);
        // 访问代理
        if (!(key in vm)) {
            proxy(vm, `_props`, key);
        }
    }
    toggleObserving(true);
}

function initData(vm: Component) {
    let data = vm.$options.data;
    data = vm._data =
        typeof data === "function" ? getData(data, vm) : data || {};

    // data必须是一个对象
    if (!isPlainObject(data)) {
        data = {};
        process.env.NODE_ENV !== "production" &&
            warn(
                "data functions should return an object:\n" +
                    "https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function",
                vm
            );
    }

    const keys = Object.keys(data);
    const props = vm.$options.props;
    const methods = vm.$options.methods;
    let i = keys.length;

    while (i--) {
        const key = keys[i];
        if (process.env.NODE_ENV !== "production") {
            if (methods && hasOwn(methods, key)) {
                warn(
                    `Method "${key}" has already been defined as a data property.`,
                    vm
                );
            }
        }
        if (props && hasOwn(props, key)) {
            process.env.NODE_ENV !== "production" &&
                warn(
                    `The data property "${key}" is already declared as a prop. ` +
                        `Use prop default value instead.`,
                    vm
                );
        } else if (!isReserved(key)) {
            // 将_data代理到vue实例上
            proxy(vm, `_data`, key);
        }
    }

    observe(data, true);
}

export function getData(data, vm): any {
    pushTarget();
    try {
        return data.call(vm, vm);
    } catch (e) {
        handleError(e, vm, `data()`);
        return {};
    } finally {
        popTarget();
    }
}

const computedWatcherOptions = { lazy: true };

function initComputed(vm, computed) {
    const watchers = (vm._computedWatchers = Object.create(null));
    const isSSR = isServerRendering();

    for (const key in computed) {
        const userDef = computed[key];
        // computed如果是一个函数，该函数作为getter，如果是一个对象，get属性值作为getter
        const getter = typeof userDef === "function" ? userDef : userDef.get;

        // 开发环境下校验是否有getter
        if (process.env.NODE_ENV !== "production" && getter == null) {
            warn(`Getter is missing for computed property "${key}".`, vm);
        }

        if (!isSSR) {
            watchers[key] = new Watcher(
                vm,
                getter || noop,
                noop,
                computedWatcherOptions
            );
        }

        if (!(key in vm)) {
            defineComputed(vm, key, userDef);
        } else if (process.env.NODE_ENV !== "production") {
            if (key in vm.$data) {
                warn(
                    `The computed property "${key}" is already defined in data.`,
                    vm
                );
            } else if (vm.$options.props && key in vm.$options.props) {
                warn(
                    `The computed property "${key}" is already defined as a prop.`,
                    vm
                );
            }
        }
    }
}

export function defineComputed(target, key, userDef) {
    sharedPropertyDefinition.get = createComputedGetter(key);
    sharedPropertyDefinition.set =
        typeof userDef === "function" ? userDef.set || noop : noop;

    if (
        process.env.NODE_ENV !== "production" &&
        sharedPropertyDefinition.set === noop
    ) {
        sharedPropertyDefinition.set = function () {
            warn(
                `Computed property "${key}" was assigned to but it has no setter.`,
                this
            );
        };
    }
    Object.defineProperty(target, key, sharedPropertyDefinition);
}

function createComputedGetter(key) {
    return function computedGetter() {
        const watcher = this._computedWatchers && this._computedWatchers[key];
        if (watcher) {
            watcher.dirty && watcher.evaluate();
            Dep.target && watcher.depend();
            return watcher.value;
        }
    };
}

function createGetterInvoker(fn) {
    return function computedGetter() {
        return fn.call(this, this);
    };
}

function initMethods(vm, methods) {
    const props = vm.$options.props;
    for (const key in methods) {
        if (process.env.NODE_ENV !== "production") {
            // 校验methods值的类型
            if (typeof methods[key] !== "function") {
                warn(
                    `Method "${key}" has type "${typeof methods[
                        key
                    ]}" in the component definition. ` +
                        `Did you reference the function correctly?`,
                    vm
                );
            }
            // 函数名是否与props中属性冲突
            if (props && hasOwn(props, key)) {
                warn(`Method "${key}" has already been defined as a prop.`, vm);
            }
            if (key in vm && isReserved(key)) {
                warn(
                    `Method "${key}" conflicts with an existing Vue instance method. ` +
                        `Avoid defining component methods that start with _ or $.`
                );
            }
        }

        vm[key] =
            typeof methods[key] !== "function" ? noop : bind(methods[key], vm);
    }
}

function initWatch(vm, watch) {
    for (const key in watch) {
        const handler = watch[key];
        if (Array.isArray(handler)) {
            for (let i = 0; i < handler.length; i++) {
                createWatcher(vm, key, handler[i]);
            }
        } else {
            createWatcher(vm, key, handler);
        }
    }
}

function createWatcher(vm, expOrFn, handler, options) {
    if (isPlainObject(handler)) {
        options = handler;
        handler = handler.handler;
    }
    // 如果定义的handler是一个字符串，那么handler从vue实例的方法上取得
    if (typeof handler === "string") {
        handler = vm[handler];
    }
    return vm.$watch(expOrFn, handler, options);
}

export function stateMixin(Vue: Class<Component>) {
    Object.defineProperty(Vue.prototype, "$data", {
        get() {
            return this._data;
        },
    });

    Object.defineProperty(Vue.prototype, "$props", {
        get() {
            return this._props;
        },
    });

    // 在原型对象上声明$set、$delete方法
    Vue.prototype.$set = set;
    Vue.prototype.$delete = del;

    // 在原型对象上声明$watch方法
    Vue.prototype.$watch = function (expOrFn, cb, options) {
        const vm = this;

        if (isPlainObject(cb)) {
            return createWatcher(vm, expOrFn, cb, options);
        }

        options = options || {};
        options.user = true;

        const watcher = new Watcher(vm, expOrFn, cb, options);

        options.immediate && cb.call(vm, watcher.value);

        return function unwatchFn() {
            watcher.teardown();
        };
    };
}
