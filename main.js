let bucket = new Set()
const obj = { text: 'hello world' }
const data = new Proxy(obj, {
    get(target, key) {
        bucket.add(effect)
        return target[key]
    },
    set(target, key, value) {
        target[key] = value
        bucket.forEach(fn => fn())
        return true
    }
})

function effect() {
    document.querySelector("#app").innerHTML = data.text
}

effect()

setTimeout(() => {
    data.text = "hello vue"
}, 1000);