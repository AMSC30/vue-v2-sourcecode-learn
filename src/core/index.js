import Vue from "./instance/index";
import { initGlobalAPI } from "./global-api/index";
import { isServerRendering } from "core/util/env";
import { FunctionalRenderContext } from "core/vdom/create-functional-component";

initGlobalAPI(Vue);

// vue运行环境判断
Object.defineProperty(Vue.prototype, "$isServer", {
  get: isServerRendering,
});

// 判断是否是服务端渲染
Object.defineProperty(Vue.prototype, "$ssrContext", {
  // getter中的this指向的是属性所在实例
  get() {
    return this.$vnode && this.$vnode.ssrContext;
  },
});

Object.defineProperty(Vue, "FunctionalRenderContext", {
  value: FunctionalRenderContext,
});

Vue.version = "__VERSION__";

export default Vue;
