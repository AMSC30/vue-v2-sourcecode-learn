import { initMixin } from "./init";
import { stateMixin } from "./state";
import { renderMixin } from "./render";
import { eventsMixin } from "./events";
import { lifecycleMixin } from "./lifecycle";

function Vue(options) {
  this._init(options);
}

// 在构造函数的原型prototype上挂载_init方法
initMixin(Vue);

// 定义实例的$data和$props属性描述器，$set和$delete方法，$watch方法
stateMixin(Vue);

// 在实例上挂载$on、$once、$off方法
eventsMixin(Vue);

// 在实例上挂载_update、$forceUpdate、$destroy 方法
lifecycleMixin(Vue);

// 在实例上定义$nextTick、_render方法
renderMixin(Vue);

export default Vue;
