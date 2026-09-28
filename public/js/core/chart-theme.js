/* Tema global Chart.js: tipografi, tooltip, sudut membulat, gradien area */
(function(){
  if(typeof Chart === 'undefined') return;
  var v = function(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); };
  var D = Chart.defaults;
  D.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
  D.font.size = 12;
  D.color = '#5F6488';
  D.animation = { duration: 700, easing: 'easeOutQuart' };
  D.interaction = { mode: 'index', intersect: false };
  D.elements.bar.borderRadius = 8;
  D.elements.bar.borderSkipped = false;
  D.elements.line.borderWidth = 2.5;
  D.elements.line.capBezierPoints = true;
  D.elements.point.radius = 0;
  D.elements.point.hoverRadius = 6;
  D.elements.point.hoverBorderWidth = 3;
  D.elements.point.hoverBorderColor = '#fff';
  D.elements.arc.borderRadius = 6;
  D.elements.arc.hoverOffset = 8;
  D.plugins.legend.labels.usePointStyle = true;
  D.plugins.legend.labels.pointStyle = 'circle';
  D.plugins.legend.labels.boxWidth = 8;
  D.plugins.legend.labels.padding = 14;
  var t = D.plugins.tooltip;
  t.backgroundColor = 'rgba(27,31,59,0.94)';
  t.titleColor = '#fff'; t.bodyColor = '#E9EAFB';
  t.padding = 12; t.cornerRadius = 10; t.boxPadding = 6;
  t.usePointStyle = true; t.titleFont = { weight: '700' };
  D.scale.grid.color = function(){ return v('--chart-grid'); };
  D.scale.grid.drawTicks = false;
  D.scale.border = { display: false };
  D.scale.ticks.padding = 8;

  // Area di bawah garis dibuat gradien lembut (hanya untuk dataset fill:true)
  Chart.register({
    id: 'softGradient',
    beforeDatasetsDraw: function(chart){
      var a = chart.chartArea; if(!a) return;
      chart.data.datasets.forEach(function(ds, i){
        if(chart.config.type !== 'line' || ds.fill !== true || !ds.borderColor || typeof ds.borderColor !== 'string') return;
        var g = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
        var c = ds.borderColor.trim(), rgb = c;
        if(c[0] === '#'){ var n = parseInt(c.slice(1), 16); rgb = (n>>16 & 255)+','+(n>>8 & 255)+','+(n & 255); }
        else { var m = c.match(/\d+/g); if(m) rgb = m.slice(0,3).join(','); }
        g.addColorStop(0, 'rgba('+rgb+',0.28)'); g.addColorStop(1, 'rgba('+rgb+',0)');
        ds.backgroundColor = g;
      });
    }
  });
  // Doughnut lebih ramping
  D.datasets.doughnut.cutout = '68%';
})();
