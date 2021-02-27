/* @flow */

import { toArray } from '../util/index'

export function initUse(Vue: GlobalAPI) {
    Vue.use = function (plugin: Function | Object) {
        // 获取构造函数已经注册插件列表
        const installedPlugins = this._installedPlugins || (this._installedPlugins = [])

        // 如果已经全局注册了，直接返回
        if (installedPlugins.indexOf(plugin) > -1) {
            return this
        }

        // 获取use方法第二项到最后一项的参数
        const args = toArray(arguments, 1)

        // 传入构造函数,拼接参数
        args.unshift(this)

        if (typeof plugin.install === 'function') {
            // 如果是个对象,直接调用对象的install方法
            plugin.install.apply(plugin, args)
        } else if (typeof plugin === 'function') {
            // 如果是个函数,直接调用函数
            plugin.apply(null, args)
        }

        // 将插件翻入列表中
        installedPlugins.push(plugin)
        return this
    }
}
