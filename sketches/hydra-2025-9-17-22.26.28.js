osc(10,1.3).rotate(3.14/2,[.2,.1,-.4,.9].fast(2))

  .thresh(.99,0)
  .modulateRotate(noise(5),.15)
  .modulateScale(voronoi(6,10,2),.8)
  .diff(src(o0).color(.1,.9,1.07)).sub(solid(1,1,1),.1)
  .modulate(osc(1),.1)

 
  
  .out()