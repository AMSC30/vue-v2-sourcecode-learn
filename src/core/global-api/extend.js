/* @flow */

import { ASSET_TYPES } from "shared/constants";
import { defineComputed, proxy } from "../instance/state";
import { extend, mergeOptions } from "../util/index";

export function initExtend(Vue: GlobalAPI) {
  Vue.cid = 0;
  let cid = 1;

  Vue.extend = function (extendOptions: Object = {}): Function {
    const Super = this;
    const SuperId = Super.cid;
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {});
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId];
    }

    const name = extendOptions.name || Super.options.name;

    // 1.子类的构造函数
    const Sub = function VueComponent(options) {
      this._init(options);
    };

    // 2.子类的原型对象
    Sub.prototype = Object.create(Super.prototype);
    Sub.prototype.constructor = Sub;
    Sub.cid = cid++;

    // 3.子类的默认options
    Sub.options = mergeOptions(Super.options, extendOptions);
    // 父类构造函数
    Sub["super"] = Super;

    if (Sub.options.props) {
      initProps(Sub);
    }
    if (Sub.options.computed) {
      initComputed(Sub);
    }

    // 4.子类的全局方法
    Sub.extend = Super.extend;
    Sub.mixin = Super.mixin;
    Sub.use = Super.use;

    // 5.子类的全局资源注册方法
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type];
    });

    if (name) {
      Sub.options.components[name] = Sub;
    }

    // 6.继承后的option信息
    Sub.superOptions = Super.options;
    Sub.extendOptions = extendOptions;
    Sub.sealedOptions = extend({}, Sub.options);

    // cache constructor
    cachedCtors[SuperId] = Sub;
    return Sub;
  };
}

function initProps(Comp) {
  const props = Comp.options.props;
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key);
  }
}

function initComputed(Comp) {
  const computed = Comp.options.computed;
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key]);
  }
}
