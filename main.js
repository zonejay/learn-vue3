// 在代理对象上添加新的属性也会触发副作用函数
// 而且当用户侧不再使用data时，垃圾回收不会
// 处理，造成内存溢出,使用weakmap可以解决
// 这个问题
let bucket = new WeakMap()
let activeEffect
// 副作用函数栈，栈顶存放当前的副作用函数
const effectStack = []
const ITERATE_KEY = Symbol()
const MAP_KEY_ITERATE_KEY = Symbol()
const RAW_KEY = Symbol()
const TriggerType = {
    SET: 'SET',
    ADD: 'ADD'
}
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
    if (!activeEffect || !shouldTrack) return
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
function trigger(target, key, type, newVal) {
    if (bucket.has(target)) {
        let depsMap = bucket.get(target)
        let effects = depsMap.get(key)
        // set的forEach如果同一个元素在删除的同时被加进set，不会被标记为已被访问
        // 会造成死循环，可以使用一个临时的set
        const effectToRun = new Set()
        effects && effects.forEach(fn => {
            if (fn !== activeEffect) {
                effectToRun.add(fn)
            }
        })
        if (
            type === TriggerType.ADD || 
            type === 'DELETE' ||
            // 如果操作类型是SET 并且目标对象的类型是Map
            // 也应该出发触发与ITERATE_KEY相关联的副作用函数
            (type === 'SET' && Object.prototype.toString.call(target) === '[object Map]')) {
            const iterateEffects = depsMap.get(ITERATE_KEY)
            iterateEffects && iterateEffects.forEach(fn => {
                if (fn !== activeEffect) {
                    effectToRun.add(fn)
                }
            })
        }
        if((type === 'ADD' || type === 'DELETE') && Object.prototype.toString.call(target) === '[object Map]') {
            const mapKeyEffects = depsMap.get(MAP_KEY_ITERATE_KEY)
            mapKeyEffects && mapKeyEffects.forEach(fn => {
                if(fn !== activeEffect) {
                    effectToRun.add(fn)
                }
            })
        }
        // 数组触发与lenght相关的副作用函数
        if (Array.isArray(target) && type === 'ADD') {
            const lengthEffetcs = depsMap.get('length')
            lengthEffetcs && lengthEffetcs.forEach(fn => {
                if (fn !== activeEffect) {
                    effectToRun.add(fn)
                }
            })
        }

        // 如果修改的是数组的length属性，需要触发索引值>=新length的副作用函数
        if (Array.isArray(target) && key === 'length') {
            depsMap.forEach((effects, key) => {
                if (key >= newVal) {
                    effects.forEach(fn => {
                        if (fn !== activeEffect) {
                            effectToRun.add(fn)
                        }
                    })
                }
            })
        }

        effectToRun.forEach(fn => {
            if (fn.config.scheduler) {
                fn.config.scheduler(fn)
            } else {
                fn()
            }
        })
    }
}
// indexOf 和lastIndexOf也需要类似的处理

const arrayInstrumentations = {}
    ;['includes', 'indexOf', 'lastIndexOf'].forEach(method => {
        const originMethod = Array.prototype.includes
        arrayInstrumentations[method] = function (...args) {
            // this 是代理对象 现在代理对象中查找 将结果存储到res中
            let res = originMethod.apply(this, args)

            if (res === false || res === -1) {
                // res 为false说明没找到 通过 this.raw拿到原始数据 再去其中查找并更新res值
                res = originMethod.apply(tis.raw, args)
            }

            return res
        }
    })
// 表示是否进行追踪 默认值true 允许追踪
let shouldTrack = true
    ;['push', 'pop', 'shift', 'unshift', 'splice'].forEach((method) => {
        const originMethod = Array.prototype[method]
        arrayInstrumentations[method] = function (...args) {
            shouldTrack = false
            let res = originMethod.apply(this, args)
            shouldTrack = true
            return res
        }
    })

// 保存与Set相关的自定义方法
const mutableInstrumentations = {
    add(key) {
        // this指向代理对象 可以通过raw来获取原始对象
        const target = this.raw
        // 先判断值是否已经存在
        const hadKey = target.has(key)
        // 执行原始数据对象的add方法来添加值
        // 不需要bind 因为是世界通过原始数据来调用
        const res = target.add(key)
        if (!hadKey) {
            // 调用trigger函数触发响应 并指定操作类型为add
            trigger(target, key, 'ADD')
        }
        return res
    },
    delete(key) {
        const target = this.raw
        const hadKey = target.has(key)
        const res = target.delete(key)
        if (hadKey) {
            trigger(target, key, 'DELETE')
        }
        return res
    },
    get(key) {
        // 获取原始对象
        const target = this.raw
        const had = target.has(key)
        track(target, key)
        // 如果存在 则返回结果 如果得到的结果res仍然是可代理的数据
        // 则要返回使用reactive包装后的响应式数据
        if(had) {
            const res = target.get(key)
            return typeof res === 'object' ? reactive(res):res
        }
    },
    set(key, value) {
        const target = this.raw
        const had = target.has(key)
        const oldVal = target.get(key)
        // 获取原始数据 由于value本身可能已经是原始数据 所以此时value.raw不存在 则直接使用value
        const rawValue = value.raw || value
        target.set(key, rawValue)
        if(!had) {
            trigger(target, key, 'ADD')
        } else if(oldVal !== value || (oldVal === oldVal && value === value)) {
            // 如果不存在 并且值变了 则是SET类型操作
            trigger(target, key, 'SET')
        }
    },
    forEach(callback, thisArg) {
        // wrap函数用来把可代理的值转换为响应式数据
        const wrap = (val) => typeof val === 'object' ? reactive(val):val;
        const target = this.raw
        track(target, ITERATE_KEY)
        target.forEach((v, k) => {
            // 手动调用callback 用wrap函数包裹value和key后再传给callback 这样就实现了深响应
            callback.call(thisArg, wrap(v), wrap(k), this)
        })
    },
    entries:iterationMethod,
    [Symbol.iterator]:iterationMethod,
    values:valuesIterationMethod, 
    keys: keysIterationMethod
}
function iterationMethod() {
    const target = this.raw
    const itr = target[Symbol.iterator]()

    const wrap = (val) => typeof val === 'object' && val !== null ? reactive(val):val;

    track(target, ITERATE_KEY)
    return {
        next() {
            const {value, done} = itr.next()
            return {
                // 如果value不是undefined 则对其进行包装
                value: value ? [wrap(value[0]), wrap(value[1])] : value,
                done
            }
        },
        [Symbol.iterator]() {
            return this
        }
    }
}
function valuesIterationMethod() {
    const target = this.raw
    const itr = target.values()

    const wrap = (val) => typeof val === 'object' ? reactive(val):val

    track(target, ITERATE_KEY)

    return {
        next() {
            const {value, done} = itr.next()
            return {
                value:wrap(value),
                done
            }
        },
        [Symbol.iterator]() {
            return this
        }
    }
}
function keysIterationMethod() {
    const target = this.raw
    const itr = target.keys()
    const wrap = (val) => typeof val === 'object' ? reactive(val) : val
    
    track(target, MAP_KEY_ITERATE_KEY)
    
    return {
        next() {
            const {value, done} = itr.next()
            return {
                value: wrap(value),
                done
            }
        },
        [Symbol.iterator]() {
            return this
        }
    }
}
function createReactive(obj, isShallow = false, isReadonly = false) {
    return new Proxy(obj, {
        get(target, key, receiver) {
            if (key === 'size') {
                // 如果读取的是size属性
                // 通过指定第三个参数 receiver为原始对象 target 从而修复问题
                track(target, ITERATE_KEY)
                return Reflect.get(target, key, target)
            }
            if (mutableInstrumentations.hasOwnProperty(key)) {
                return mutableInstrumentations[key]
            }
            // console.log('track');
            if (key === 'raw') {
                return target
            }
            // 如果操作的目标对象是数组 并且key存在于arrayInstrumentations上
            // 那么返回定义在arrayInstrumentations上的值
            if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
                return Reflect.get(arrayInstrumentations, key, receiver)
            }
            // 只读状态下不必建立响应
            // 不跟踪symbol属性值 why
            if (!isReadonly && typeof key !== 'symbol') {
                track(target, key)
            }
            const res = Reflect.get(target, key, receiver)
            if (isShallow) {
                return res
            }

            // 得到原始数据
            if (typeof res === 'object' && res !== null) {
                // 将结果包装成响应式数据
                // 如果是readonly 对象属性也应该是readonly
                return isReadonly ? readonly(res) : reactive(res)
            }
            return res
        },
        has(target, key) {
            track(target, key)
            return Reflect.has(target, key)
        },
        ownKeys(target) {
            track(target, Array.isArray(target) ? 'length' : ITERATE_KEY)
            return Reflect.ownKeys(target)
        },
        set(target, key, newVal, receiver) {
            // 判断只读
            if (isReadonly) {
                console.log(`属性 ${key}是只读的`);
                return true
            }
            // 合理触发响应 先获取旧值
            const oldVal = target[key]
            // 添加属性还是修改属性
            // 通过索引设置数组时，如果索引大于当前数组长度，也应该触发与length有关的副作用函数
            const type = Array.isArray(target)
                ? Number(key) < target.length ? 'SET' : 'ADD'
                : Object.prototype.hasOwnProperty.call(target, key) ? TriggerType.SET : TriggerType.ADD
            const res = Reflect.set(target, key, newVal, receiver)

            // target === receiver.raw 说明receiver就是target的代理对象，避免不必要更新
            if (target === receiver.raw) {
                // 比较旧值与新值 并且不为NaN
                if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
                    trigger(target, key, type, newVal)
                }
            }
            return res
        },
        deleteProperty(target, key) {
            // 只读
            if (isReadonly) {
                console.log(`属性 ${key}是只读的`);
                return true
            }
            // 检查属性
            const hadKey = Object.prototype.hasOwnProperty.call(target, key)
            // 使用reflect删除属性
            const res = Reflect.deleteProperty(target, key)

            if (res && hadKey) {
                // 只有当被删除的属性是对象自己的属性并且成功删除时，才触发更新
                trigger(target, key, 'DELETE')
            }
            return res
        }
    })
}
// 定义一个map实例 存储原始对象到代理对象的映射
const reactiveMap = new Map()
function reactive(obj) {
    // 优先通过原始对象obj寻找之前创建的代理对象 如果找到了 直接返回已有的代理对象
    const existionProxy = reactiveMap.get(obj)
    if (existionProxy) return existionProxy
    // 否则 创建新的代理对象
    const proxy = createReactive(obj)
    // 保存在map中
    reactiveMap.set(obj, proxy)

    return proxy
}

function shallowReactive(obj) {
    return createReactive(obj, true)
}

function readonly(obj) {
    return createReactive(obj, false, true)
}

function shallowReadonly(obj) {
    return createReactive(obj, true, true)
}

const data = reactive(obj)

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
        if (cleanup) {
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
            if (options.flush === 'post') {
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

// effect(() => {
//     for (const key in data) {
//         console.log(key);
//     }
// })

// start 值变化才更新 
// effect(() => {
//     console.log(data.count);
// })

// data.count = data.count
// end

// start 合理触发响应
// const obj1 = {}
// const proto = { bar: 1 }
// const child = reactive(obj1)
// const parent = reactive(proto)
// Object.setPrototypeOf(child, parent)

// effect(() => {
//     console.log(child.bar)
// })

// child.bar = 2
// end
// start 深响应与浅响应
// const obj3 = reactive({ foo: { bar: 1 } })
// effect(() => {
//     console.log(obj3.foo.bar);
// })
// obj3.foo.bar = 2

// const obj4 = shallowReactive({ foo: { bar: 1 } })
// effect(() => {
//     console.log(obj4.count);
// })
// obj4.count = 4
// end

// start readonly
// const obj5 = shallowReadonly({ foo: { count: 1 } })
// effect(() => {
//     obj5.foo
// })
// obj5.foo.count = 2
// end

// start array
// 通过索引新增元素来触发与length相关的副作用函数
// const arr = reactive(['foo'])
// effect(() => {
//     console.log(arr.length);
// })
// arr[1] = 'bar'
// // 修改数组长度触发副作用函数
// const arr2 = reactive(['foo'])
// effect(() => {
//     console.log(arr2[2]);
// })
// arr2.length = 0
// end

// start 遍历数组
// const arr = reactive(['foo'])
// effect(() => {
//     for (const key of arr) {
//         console.log(key);
//     }
// })
// arr[1] = 'sb'
// end

// start 数组的查找方法
// const arr = reactive([1, 2])
// effect(() => {
//     console.log(arr.includes(1));
// })
// arr[0] = 3

// const obj2 = {}
// const arr = reactive([obj2])
// console.log(arr.includes(arr[0]));
// end

// start 数组修改方法
// const arr = reactive(['foo'])
// effect(() => {
//     arr.push('bar')
// })

// effect(() => {
//     arr.push('der')
// })
// end

// start map and set
// const p1 = reactive(new Set([1, 2, 3]))
// effect(() => {
//     console.log(p1.size);
// })

// p1.delete(1)
// end

// start 避免原始数据污染
// const p1 = reactive(new Map([['key', 1]]))
// effect(() => {
//     console.log(p1.get('key'));
// })
// p1.set('key', 2)
// 原始Map
// const m = new Map()
// const p2 = reactive(m)
// const p3 = reactive(new Map())
// p2.set('p3', p3)

// effect(() => {
//     // 通过原始数据m访问p3
//     console.log(m.get('p3').size);
// })
// // 通过原始数据m为p3设置一个键值对 不应该出发副作用函数
// m.get('p3').set('foo', 1)
// end

// start Map forEach
// section start
// const m = reactive(new Map([[{key:1}, {value:1}]]))
// effect(() => {
//     m.forEach(function(value, key, m) {
//         console.log(value);
//         console.log(key);
//     })
// })
// m.set({key:2}, {value:2})
// section end
// section start
// const key = {key:1}
// const value = new Set([1,2,3])
// const p1 = reactive(new Map([['key', 1]]))
// effect(() => {
//     p1.forEach(function(value, key) {
//         console.log(value);
//         console.log(key);
//     })
// })

// p1.set('key', 2)
// section end
// end

// start 迭代器方法
const p1 = reactive(new Map([
    ['key1', 'value1'],
    ['key2', 'value2']
]))
effect(() => {
    for(const val of p1.keys()) {
        console.log(val);
    }
})
p1.set('key2', 'value3')
// end