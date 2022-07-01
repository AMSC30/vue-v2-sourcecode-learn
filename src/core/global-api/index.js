/* @flow */

import config from "../config";
import { initUse } from "./use";
import { initMixin } from "./mixin";
import { initExtend } from "./extend";
import { initAssetRegisters } from "./assets";
import { set, del } from "../observer/index";
import { ASSET_TYPES } from "shared/constants";
import builtInComponents from "../components/index";

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive,
} from "../util/index";

export function initGlobalAPI(Vue: GlobalAPI) {
  // 定义Vue构造函数的默认配置
  Object.defineProperty(Vue, "config", {
    get: () => config,
  });

  // 将工具函数整合到构造函数的util属性上
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive,
  };

  Vue.set = set;
  Vue.delete = del;
  Vue.nextTick = nextTick;

  // 1.默认options
  Vue.options = Object.create(null);
  // 全局资源['component', 'directive', 'filter']
  ASSET_TYPES.forEach((type) => {
    Vue.options[type + "s"] = Object.create(null);
  });
  Vue.options._base = Vue;
  // keep-alive组件
  extend(Vue.options.components, builtInComponents);

  // 2.全局的方法
  // 构造函数的use方法
  initUse(Vue);
  // 构造函数的mixin方法，将传入的对象与构造函数的默认options进行合并
  initMixin(Vue);
  // 构造函数extend方法
  initExtend(Vue); //

  // 3.全局资源方法
  // 定义全局component、directive、filter的注册方法，这些方法都会改变全局默认options
  initAssetRegisters(Vue);
}
