// 在代理对象上添加新的属性也会触发副作用函数
// 而且当用户侧不再使用data时，垃圾回收不会
// 处理，造成内存溢出,使用weakmap可以解决
// 这个问题
let bucket = new WeakMap()
let activeEffect
// 副作用函数栈，栈顶存放当前的副作用函数
const effectStack = []
const ITERATE_KEY = Symbol()
const obj = { 
    text: 'hello world', 
    show: true, 
    count: 0, 
    firstName: 'john', 
    lastName: 'smith', 
    foo: 1, 
    get bar() {
        console.log(this);
        return this.foo
    } 
}
const jobQueue = new Set()
const p = Promise.resolve()

// 刷新标识
let isFlushing = false
function flushJob() {
    if (isFlushing) return
    // 标识设为true 表示正在刷新
    isFlushing = true
    p.then(() => {
        jobQueue.forEach(fn => fn())
    }).finally(() => {
        // 结束后重置
        isFlushing = false
    })
}
function cleanup(effectFn) {
    for (let i = 0; i < effectFn.deps.length; i++) {
        const deps = effectFn.deps[i];
        deps.delete(effectFn)
    }
    effectFn.deps.length = 0
}
function track(target, key) {
    if (!activeEffect) return
    let depsMap
    if (bucket.has(target)) {
        depsMap = bucket.get(target)
    } else {
        bucket.set(target, (depsMap = new Map()))
    }
    let deps
    if (depsMap.has(key)) {
        deps = depsMap.get(key)
    } else {
        depsMap.set(key, (deps = new Set()))
    }
    deps.add(activeEffect)
    // console.log(activeEffect);
    activeEffect.deps.push(deps)
}
function trigger(target, key) {
    if (bucket.has(target)) {
        let depsMap = bucket.get(target)
        let effects = depsMap.get(key)
        const iterateEffects = depsMap.get(ITERATE_KEY)
        // set的forEach如果同一个元素在删除的同时被加进set，不会被标记为已被访问
        // 会造成死循环，可以使用一个临时的set
        const effectToRun = new Set()
        effects && effects.forEach(fn => {
            if (fn !== activeEffect) {
                effectToRun.add(fn)
            }
        })
        
        iterateEffects && iterateEffects.forEach(fn => {
            if (fn !== activeEffect) {
                effectToRun.add(fn)
            }
        })
        
        effectToRun.forEach(fn => {
            if (fn.config.scheduler) {
                fn.config.scheduler(fn)
            } else {
                fn()
            }
        })
    }
}
const data = new Proxy(obj, {
    get(target, key, receiver) {
        // console.log('track');
        track(target, key)
        return Reflect.get(target, key, receiver)
    },
    has(target,key) {
        console.log(key);
        console.log('has');
        track(target, key)
        return Reflect.has(target, key)
    },
    ownKeys(target) {
        track(target, ITERATE_KEY)
        return Reflect.ownKeys(target)
    },
    set(target, key, value, receiver) {
        const res = Reflect.set(target,key,value,receiver)
        trigger(target, key)
        return res
    }
})

const effect = (fn, config = {}) => {
    const effectFn = () => {
        cleanup(effectFn)
        activeEffect = effectFn
        // fn是真正的副作用函数，在执行之前压入栈顶
        effectStack.push(effectFn)
        const res = fn()
        // 执行完成之后推出当前副作用
        effectStack.pop()

        // activeEffect始终指向栈顶
        activeEffect = effectStack[effectStack.length - 1]
        return res
    }
    // deps数组缓存bucket中的set
    effectFn.deps = []
    effectFn.config = config
    if (!config.lazy) {
        effectFn()
    }
    return effectFn
}

// effect(() => {
//     // 在副作用函数中，初始show为true，当show为false的时候再去改变text的值
//     // 会重新触发副作用函数。可以执行清理操作避免分支切换的时候执行多余的副作用
//     // 函数，因为每次执行副作用函数都会重新出发track，可以在track函数中清除依赖
//     // document.querySelector("#app").innerHTML = data.count
//     // effect(() => {
//     //     console.log('nesting effect');
//     //    data.show = false
//     // })
//     // document.querySelector("#app").innerHTML = fullname.value
//     // console.log('execed');
//     // 自增操作同样会引起无限递归循环，解决方法是在trigger函数中判断要执行的副作用
//     // 函数是不是acitveEffect
//     // data.count++
//     console.log(data.count);
// }, {
//     // 调度器，决定何时运行副作用函数
//     // scheduler(fn){
//     //     setTimeout(fn)
//     // },
//     // scheduler(fn) {
//     //     jobQueue.add(fn)
//     //     flushJob()
//     // }
//     lazy: false
// })
function computed(getter) {
    // 缓存值
    let value
    let dirty = true
    const effectFn = effect(getter, {
        lazy: true, scheduler() {
            dirty = true
            trigger(obj, 'value')
        }
    })
    const obj = {
        get value() {
            if (dirty) {
                value = effectFn()
                dirty = false
            }
            track(obj, 'value')
            return value
        }
    }
    return obj
}
function traverse(value, seen = new Set()) {
    // 检查是否读取过
    if (typeof value !== 'object' || value === null || seen.has(value)) return
    // 没有则添加
    seen.add(value)
    // 使用for in遍历对象的每一个值，递归处理
    for (const key in value) {
        traverse(value[key], seen)
    }
    return value
}

function watch(source, cb, options = {}) {
    // 使用getter，可以指定当对应的数据发生变化时才执行回调
    let getter
    if (typeof source === 'function') {
        getter = source
    } else {
        getter = () => traverse(source)
    }
    const job = () => {
        if(cleanup) {
            cleanup()
        }
        newValue = effectFn()
        cb(newValue, oldValue, onInvalidate)
        oldValue = newValue
    }
    let oldValue, newValue
    // 用来存储用户注册的过期回调 
    let cleanup
    function onInvalidate(fn) {
        cleanup = fn
    }
    const effectFn = effect(() => getter(), {
        lazy: true,
        scheduler: () => {
            if(options.flush === 'post') {
                const p = Promise.resolve()
                p.then(job)
            } else {
                job()
            }
        }
    })
    if (options.immediate) {
        job()
    } else {
        oldValue = effectFn()
    }
}

// const fullname = computed(() => {
//     console.log('computed effect');
//     return data.firstName + ' ' + data.lastName
// })
// console.log(fullname.value);
// effect(() => {
//     document.querySelector("#app").innerHTML = fullname.value
// })
// setTimeout(() => {
//     data.firstName = 'haruhi'
// }, 1000);

// watch(() => data.foo, (newValue, oldValue) => {
//     console.log(newValue, oldValue);
// })

// setTimeout(() => {
//     data.foo++
// }, 2000);

// 立即执行watch
// watch(() => data.foo, () => {
//     console.log('foo changed');
// }, {
//     // immediate: true
//     flush: 'post' // 'pre' 'sync' 组件更新前/后
// })
// data.foo++
// let finalData
// watch(() => data.foo, async (newValue, oldValue, onInvalidate) => {
//     let expired = false
//     onInvalidate(() => {
//         expired = true
//     })
    
//     const res = await fetch('https://api.coindesk.com/v1/bpi/currentprice.json')
//     if(!expired) {
//         finalData = res
//     }
// })
// data.foo++
// setTimeout(() => {
//     data.foo = 3
// }, 200);

// in的副作用函数
// effect(() => {
//     'foo' in data
// })

effect(() => {
    for (const key in data) {
        console.log(key);
    }
})

data.sb = 'sb'