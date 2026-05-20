let sp = 6
let sz = 3

voronoi(sz,sp,0)
 .diff(voronoi(sz,sp,0).scale(.9))
 .thresh(.5,.1)
 .kaleid(8)
// .scrollX([.1,-.1,.5].ease('easeInOutCubic').fast(.1))
 .scale(1,.7)
//  .colorama(1.1)
  .add(src(o1).scale(.95),.97)
// .rotate([.1,.001,.1,-.1].ease('easeInOutCubic'))


  .out(o1)

src(o1)
  .colorama(1.1)
  .out()