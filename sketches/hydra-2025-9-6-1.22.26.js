s0.initCam()

voronoi().diff(voronoi().scale([.9,.99].ease('easeInOutCubic')))

   .add(src(o0).scrollX(.01).scale(1.05).color(.001),.9)
//  .diff(shape().color(1,1,0))
  .modulateRotate(osc(10,.05),.1)
//.rotate(-.08)
 .hue([.01,.05,.1,.3])
  .out()

voronoi(5,.5,1).out(o1)

render(o0)

speed = 10