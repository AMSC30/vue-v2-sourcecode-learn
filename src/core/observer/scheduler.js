/* @flow */

import type Watcher from "./watcher";
import config from "../config";
import { callHook, activateChildComponent } from "../instance/lifecycle";

import { warn, nextTick, devtools, inBrowser, isIE } from "../util/index";

export const MAX_UPDATE_COUNT = 100;

const queue: Array<Watcher> = [];
const activatedChildren: Array<Component> = [];
let has: { [key: number]: ?true } = {};
let circular: { [key: number]: number } = {};
let waiting = false;
let flushing = false;
let index = 0;

function resetSchedulerState() {
    index = queue.length = activatedChildren.length = 0;
    has = {};
    waiting = flushing = false;
}

export let currentFlushTimestamp = 0;

let getNow: () => number = Date.now;

if (inBrowser && !isIE) {
    const performance = window.performance;
    if (
        performance &&
        typeof performance.now === "function" &&
        getNow() > document.createEvent("Event").timeStamp
    ) {
        getNow = () => performance.now();
    }
}

// 将队列当中的每个watcher进行更新
function flushSchedulerQueue() {
    currentFlushTimestamp = getNow();
    // 更新标识
    flushing = true;
    let watcher, id;

    // 在队列中先根据id对watcher进行排序
    queue.sort((a, b) => a.id - b.id);

    // 执行watcher中的run方法，在此之前，如果在初始化的时候，options中传入了before，先执行before方法
    for (index = 0; index < queue.length; index++) {
        watcher = queue[index];
        if (watcher.before) {
            watcher.before();
        }
        id = watcher.id;

        // watcher执行更新后清空记录
        has[id] = null;

        // 获取值，执行回调cb
        watcher.run();
    }

    const activatedQueue = activatedChildren.slice();
    const updatedQueue = queue.slice();

    // 清空队列
    resetSchedulerState();

    callActivatedHooks(activatedQueue);
    callUpdatedHooks(updatedQueue);

    if (devtools && config.devtools) {
        devtools.emit("flush");
    }
}

function callUpdatedHooks(queue) {
    let i = queue.length;
    while (i--) {
        const watcher = queue[i];
        const vm = watcher.vm;
        if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
            callHook(vm, "updated");
        }
    }
}

export function queueActivatedComponent(vm: Component) {
    vm._inactive = false;
    activatedChildren.push(vm);
}

function callActivatedHooks(queue) {
    for (let i = 0; i < queue.length; i++) {
        queue[i]._inactive = true;
        activateChildComponent(queue[i], true);
    }
}

export function queueWatcher(watcher) {
    // 将watcher放入队列当中
    const id = watcher.id;
    if (has[id] == null) {
        has[id] = true;
        // 在将watcher加入队列时，如果当前正在进行更新，根据当前id将watcher插入队列当中
        // 否则直接将watcher放入队尾，因为在后期进行真正更新的时候对队列进行sort排序
        if (!flushing) {
            queue.push(watcher);
        } else {
            let i = queue.length - 1;
            while (i > index && queue[i].id > watcher.id) {
                i--;
            }
            queue.splice(i + 1, 0, watcher);
        }

        // 之前没有watcher放入队列，将watcher的执行放在下一个事件循环当中
        // 如果之前放过watcher并且还没有结束，直接放入队列中
        if (!waiting) {
            waiting = true;

            nextTick(flushSchedulerQueue);
        }
    }
}
