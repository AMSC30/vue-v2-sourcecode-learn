/* @flow */

import config from "../config";
import { initUse } from "./use";
import { initMixin } from "./mixin";
import { initExtend } from "./extend";
import { initAssetRegisters } from "./assets";
import { set, del } from "../observer/index";
import { ASSET_TYPES } from "shared/constants";
import builtInComponents from "../components/index";
import { observe } from "core/observer/index";

import {
    warn,
    extend,
    nextTick,
    mergeOptions,
    defineReactive,
} from "../util/index";

export function initGlobalAPI(Vue: GlobalAPI) {
    Object.defineProperty(Vue, "config", {
        get() {
            return config;
        },
    });

    Vue.util = {
        warn,
        extend,
        mergeOptions,
        defineReactive,
    };

    Vue.set = set;
    Vue.delete = del;
    Vue.nextTick = nextTick;

    // options
    Vue.options = Object.create(null);

    // ASSET_TYPES = ['component', 'directive', 'filter']
    ASSET_TYPES.forEach((type) => {
        Vue.options[type + "s"] = Object.create(null);
    });

    Vue.options._base = Vue;

    // keep-alive组件
    extend(Vue.options.components, builtInComponents);
    // 结果:
    // options:{
    // _base:Vue,
    // components:{keep-alive},
    // directives:{},
    // filters:{}
    // }

    // 全局的api
    // 构造函数的use方法，本质上是调用传进来的方法
    initUse(Vue);

    // 构造函数的mixin方法，本质上是将一个选项和Vue构造函数上默认的选项进行合并生成新的默认选项
    initMixin(Vue);

    // 创建一个子类构造函数
    initExtend(Vue); //

    // 定义全局component、directive、filter的注册方法，这些方法都会改变全局默认options
    initAssetRegisters(Vue);
}
