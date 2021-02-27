/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject } from '../util/index'

export function initAssetRegisters(Vue: GlobalAPI) {
    ASSET_TYPES.forEach(type => {
        Vue[type] = function (id: string, definition: Function | Object): Function | Object | void {
            if (!definition) {
                // 如果没有传入定义函数或者对象， 则返回全局注册的组件、指令、过滤器定义
                // 或者理解为查询定义
                return this.options[type + 's'][id]
            } else {
                if (type === 'component' && isPlainObject(definition)) {
                    // 如果没有在组件描述中定义name，则使用注册时候的名字
                    definition.name = definition.name || id
                    definition = this.options._base.extend(definition)
                }
                // 如果指令是一个函数
                if (type === 'directive' && typeof definition === 'function') {
                    definition = { bind: definition, update: definition }
                }
                // 注册到全局中
                this.options[type + 's'][id] = definition
                return definition
            }
        }
    })
}
