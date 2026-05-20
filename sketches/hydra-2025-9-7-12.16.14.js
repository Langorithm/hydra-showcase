s0.initCam()

src(o0)
  .modulateHue(src(o0).scale([1.2,.98].fast().smooth()).rotate([.2,.1,.01,-.1,2,0,0,0,0,0]))
  .rotate(.009,.000001)
  .out(o0)


src(o0)


  .out(o1)

render(o1)



