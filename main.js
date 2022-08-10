// 在代理对象上添加新的属性也会触发副作用函数
// 而且当用户侧不再使用data时，垃圾回收不会
// 处理，造成内存溢出,使用weakmap可以解决
// 这个问题
let bucket = new WeakMap()
let activeEffect
const obj = { text: 'hello world', show:true }
function cleanup(effectFn) {
    for (let i = 0; i < effectFn.deps.length; i++) {
        const deps = effectFn.deps[i];
        deps.delete(effectFn)
    }
    effectFn.deps.length = 0
}
function track(target,key) {
    let depsMap
    if(bucket.has(target)) {
        depsMap = bucket.get(target)
    } else {
        bucket.set(target,(depsMap = new Map()))
    }
    let deps
    if(depsMap.has(key)) {
        deps = depsMap.get(key)
    } else {
        depsMap.set(key, (deps = new Set()))
    }
    deps.add(activeEffect)
    activeEffect.deps.push(deps)
}
function trigger(target,key) {
    if(bucket.has(target)) {
        let depsMap = bucket.get(target)
        if(depsMap.has(key)) {
            let deps = depsMap.get(key)
            // set的forEach如果同一个元素在删除的同时被加进set，不会被标记为已被访问
            // 会造成死循环，可以使用一个临时的set
            const cacheDeps = new Set(deps)
            cacheDeps.forEach(fn => fn())
        }
    }
}
const data = new Proxy(obj, {
    get(target, key) {
        track(target,key)
        return target[key]
    },
    set(target, key, value) {
        target[key] = value
        trigger(target,key)
        return true
    }
})

const effect = (fn) => {
    const effectFn = () => {
        cleanup(effectFn)
        activeEffect = effectFn
        fn()
    }
    // deps数组缓存bucket中的set
    effectFn.deps = []
    effectFn()
}

effect(() => {
    // 在副作用函数中，初始show为true，当show为false的时候再去改变text的值
    // 会重新触发副作用函数。可以执行清理操作避免分支切换的时候执行多余的副作用
    // 函数，因为每次执行副作用函数都会重新出发track，可以在track函数中清除依赖
    console.log('execed');
    document.querySelector("#app").innerHTML = data.show ? data.text:'none'
})

setTimeout(() => {
    data.show = false
    data.text = "hello vue"
}, 1000);