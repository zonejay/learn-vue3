// 在代理对象上添加新的属性也会触发副作用函数
// 而且当用户侧不再使用data时，垃圾回收不会
// 处理，造成内存溢出,使用weakmap可以解决
// 这个问题
let bucket = new WeakMap()
let activeEffect
const obj = { text: 'hello world' }
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
}
function trigger(target,key) {
    if(bucket.has(target)) {
        let depsMap = bucket.get(target)
        if(depsMap.has(key)) {
            let deps = depsMap.get(key)
            deps.forEach(fn => fn())
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
    activeEffect = fn
    fn()
}

effect(() => {
    console.log('execed');
    document.querySelector("#app").innerHTML = data.text
})

setTimeout(() => {
    data.text = "hello vue"
    data.year = 2019
    data.day = 9
}, 1000);