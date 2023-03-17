/* @flow */

import Dep from "./dep";
import VNode from "../vdom/vnode";
import { arrayMethods } from "./array";
import {
    def,
    warn,
    hasOwn,
    hasProto,
    isObject,
    isPlainObject,
    isPrimitive,
    isUndef,
    isValidArrayIndex,
    isServerRendering,
} from "../util/index";

const arrayKeys = Object.getOwnPropertyNames(arrayMethods);

export let shouldObserve: boolean = true;

export function toggleObserving(value: boolean) {
    shouldObserve = value;
}

export class Observer {
    constructor(value: any) {
        this.value = value;

        // 依赖收集器
        this.dep = new Dep();

        this.vmCount = 0;

        def(value, "__ob__", this);

        if (!Array.isArray(value)) {
            this.walk(value);
            return;
        }

        hasProto
            ? protoAugment(value, arrayMethods)
            : copyAugment(value, arrayMethods, arrayKeys);

        this.observeArray(value);
    }

    walk(obj) {
        Object.keys(obj).forEach((key) => {
            defineReactive(obj, key);
        });
    }

    observeArray(items: Array<any>) {
        for (let i = 0, l = items.length; i < l; i++) {
            observe(items[i]);
        }
    }
}

function protoAugment(target, src: Object) {
    target.__proto__ = src;
}

function copyAugment(target: Object, src: Object, keys: Array<string>) {
    for (let i = 0, l = keys.length; i < l; i++) {
        const key = keys[i];
        def(target, key, src[key]);
    }
}

export function observe(value: any, asRootData: ?boolean): Observer | void {
    if (!isObject(value) || value instanceof VNode) {
        return;
    }

    let ob: Observer | void;

    if (hasOwn(value, "__ob__") && value.__ob__ instanceof Observer) {
        // 如果value有Observe的实例
        ob = value.__ob__;
    } else if (
        shouldObserve &&
        !isServerRendering() &&
        (Array.isArray(value) || isPlainObject(value)) &&
        Object.isExtensible(value) &&
        !value._isVue
    ) {
        ob = new Observer(value);
    }

    if (asRootData && ob) {
        ob.vmCount++;
    }
    return ob;
}

// 重写对象的getter和setter
export function defineReactive(
    obj: Object,
    key: string,
    val: any,
    customSetter?: ?Function,
    shallow?: boolean
) {
    // 创建一个依赖收集器 这里是一个闭包变量，属性的getter和setter函数可以访问到
    const dep = new Dep();

    const property = Object.getOwnPropertyDescriptor(obj, key);
    if (property && property.configurable === false) {
        return;
    }

    const getter = property && property.get;
    const setter = property && property.set;

    if ((!getter || setter) && arguments.length === 2) {
        val = obj[key];
    }

    let childOb = !shallow && observe(val);

    Object.defineProperty(obj, key, {
        enumerable: true,
        configurable: true,
        get: function () {
            // 获取到属性值
            const value = getter ? getter.call(obj) : val;

            // 收集watcher
            if (Dep.target) {
                dep.depend();
                if (childOb) {
                    // 数组也在getter中收集依赖
                    childOb.dep.depend();

                    if (Array.isArray(value)) {
                        dependArray(value);
                    }
                }
            }

            // 返回属性值
            return value;
        },

        set: function (newVal) {
            const value = getter ? getter.call(obj) : val;

            if (newVal === value || (newVal !== newVal && value !== value)) {
                return;
            }
            if (getter && !setter) return;
            if (setter) {
                setter.call(obj, newVal);
            } else {
                val = newVal;
            }

            childOb = !shallow && observe(newVal);

            // 通知依赖进行更新
            dep.notify();
        },
    });
}

export function set(target, key, val) {
    if (Array.isArray(target) && isValidArrayIndex(key)) {
        target.length = Math.max(target.length, key);
        target.splice(key, 1, val);
        return val;
    }

    if (key in target && !(key in Object.prototype)) {
        target[key] = val;
        return val;
    }

    const ob = target.__ob__;

    if (!ob) {
        target[key] = val;
        return val;
    }

    defineReactive(ob.value, key, val);

    ob.dep.notify();

    return val;
}

export function del(target: Array<any> | Object, key: any) {
    if (Array.isArray(target) && isValidArrayIndex(key)) {
        target.splice(key, 1);
        return;
    }
    const ob = target.__ob__;

    // 不能修改vue实例的属性
    if (target._isVue || (ob && ob.vmCount)) return;
    if (!hasOwn(target, key)) return;

    delete target[key];
    if (!ob) return;

    ob.dep.notify();
}

function dependArray(value: Array<any>) {
    for (let e, i = 0, l = value.length; i < l; i++) {
        e = value[i];
        e && e.__ob__ && e.__ob__.dep.depend();
        if (Array.isArray(e)) {
            dependArray(e);
        }
    }
}
