particlesJS('particles',

{
    "particles": {
      "number": {
        "value": 140,
        "density": {
          "enable": true,
          "value_area": 1000
        }
      },
      "color": {
        "value": "#00D2FF"
      },
      "shape": {
        "type": "circle"
      },
      "opacity": {
        "value": 0.65,
        "random": true,
        "anim": {
          "enable": true,
          "speed": 0.5,
          "opacity_min": 0.2,
          "sync": false
        }
      },
      "size": {
        "value": 4.5,
        "random": true,
        "anim": {
          "enable": true,
          "speed": 1.5,
          "size_min": 1,
          "sync": false
        }
      },
      "line_linked": {
        "enable": true,
        "distance": 120,
        "color": "#00D2FF",
        "opacity": 0.12,
        "width": 1
      },
      "move": {
        "enable": true,
        "speed": 2.5,
        "direction": "none",
        "random": true,
        "straight": false,
        "out_mode": "out",
        "bounce": false,
        "attract": {
          "enable": true,
          "rotateX": 800,
          "rotateY": 1200
        }
      }
    },
    "interactivity": {
      "detect_on": "window",
      "events": {
        "onhover": {
          "enable": false
        },
        "onclick": {
          "enable": true,
          "mode": "push"
        },
        "resize": true
      },
      "modes": {
        "push": {
          "particles_nb": 3
        }
      }
    },
    "retina_detect": true
  }

);

/* ── Smooth cursor repulsion ───────────────────────────────────────
   Replaces the built-in repulse (which snaps particles instantly)
   with a gentle per-frame nudge that builds up over time.          */
(function () {
  var RADIUS = 120;    // influence radius in CSS px
  var STRENGTH = 5.6;  // max px nudge per frame at closest distance

  function tick() {
    if (window.pJSDom && window.pJSDom.length) {
      var pJS = window.pJSDom[0].pJS;
      if (pJS.interactivity.status === 'mousemove') {
        var mx = pJS.interactivity.mouse.pos_x;
        var my = pJS.interactivity.mouse.pos_y;
        if (mx != null && my != null) {
          var ratio = pJS.canvas.pxratio || 1;
          var r = RADIUS * ratio;
          var s = STRENGTH * ratio;
          var rSq = r * r;
          var particles = pJS.particles.array;
          for (var i = 0, len = particles.length; i < len; i++) {
            var p = particles[i];
            var dx = p.x - mx;
            var dy = p.y - my;
            var distSq = dx * dx + dy * dy;
            if (distSq < rSq && distSq > 1) {
              var dist = Math.sqrt(distSq);
              var force = s * (1 - dist / r);
              p.x += (dx / dist) * force;
              p.y += (dy / dist) * force;
            }
          }
        }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

/* ── Cursor spotlight ──────────────────────────────────────────────
   Adds a soft radial glow that follows the mouse over the page.   */
(function () {
  var spot = document.getElementById('cursor-spotlight');
  if (!spot) return;

  document.addEventListener('mousemove', function (e) {
    spot.style.opacity = '1';
    spot.style.background =
      'radial-gradient(circle 220px at ' + e.clientX + 'px ' + e.clientY + 'px, ' +
      'rgba(0, 210, 255, 0.07) 0%, transparent 100%)';
  });

  document.addEventListener('mouseleave', function () {
    spot.style.opacity = '0';
  });
})();