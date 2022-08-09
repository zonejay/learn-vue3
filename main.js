let bucket = new Set()
// 使用硬编码的effect不利于解耦
let activeEffect
const obj = { text: 'hello world' }
const data = new Proxy(obj, {
    get(target, key) {
        bucket.add(activeEffect)
        return target[key]
    },
    set(target, key, value) {
        target[key] = value
        bucket.forEach(fn => fn())
        return true
    }
})

const effect = (fn) => {
    activeEffect = fn
    fn()
}

effect(() => {
    document.querySelector("#app").innerHTML = data.text
})

setTimeout(() => {
    data.text = "hello vue"
}, 1000);