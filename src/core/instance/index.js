import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

function Vue(options) {
    if (process.env.NODE_ENV !== 'production' && !(this instanceof Vue)) {
        warn('Vue is a constructor and should be called with the `new` keyword')
    }
    this._init(options)
}

// 在构造函数的原型prototype上挂载_init方法
initMixin(Vue)

// 定义实例的$data和$props属性描述器，$set和$delete方法，$watch方法(本质上初始化了data和props属性和常见的操作方法)
stateMixin(Vue)

// 在实例上挂载$on、$once、$off、$emit方法（本质上定义了自定义时间的监听、触发、取消监听的方法）
eventsMixin(Vue)

// 在实例上挂载_update、$forceUpdate、$destroy 方法
lifecycleMixin(Vue)

// 在实例上定义$nextTick、_render方法
renderMixin(Vue)

export default Vue
