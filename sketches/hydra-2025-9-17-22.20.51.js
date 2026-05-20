
osc(10,.3).rotate(3.14/2,[.2,.1,-.4])

  .thresh(.99,0)
  .modulateRotate(noise(5),.15)
  .diff(o0).sub(solid(1,1,1),.1)
  .color([1.4,0].smooth(),[0],[.4,1.4].smooth())
 
  
  .out()