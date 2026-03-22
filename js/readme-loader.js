/**
 * README Loader — fetches READMEs from GitHub API, renders markdown,
 * and builds the project tile grid from the PROJECTS config.
 */
(function () {
    'use strict';

    const CACHE_PREFIX = 'readme_cache_';

    // ── GitHub API fetch ──────────────────────────────────────────────
    async function fetchReadme(owner, repo) {
        const cacheKey = CACHE_PREFIX + owner + '/' + repo;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) return cached;

        const url = 'https://api.github.com/repos/' +
            encodeURIComponent(owner) + '/' +
            encodeURIComponent(repo) + '/readme';

        const res = await fetch(url, {
            headers: { 'Accept': 'application/vnd.github.raw+json' }
        });

        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        sessionStorage.setItem(cacheKey, text);
        return text;
    }

    // ── Video URL detection ─────────────────────────────────────────
    function isVideoUrl(url) {
        if (!url) return false;
        // Explicit video file extensions
        if (/\.(mp4|webm|mov|ogv)(\?.*)?$/i.test(url)) return true;
        // GitHub drag-and-drop uploaded assets (no extension)
        if (/github\.com\/[^/]+\/[^/]+\/assets\/\d+\/[\w-]+$/i.test(url)) return true;
        // Private user images hosting (redirected GitHub assets)
        if (/private-user-images\.githubusercontent\.com\/.+/i.test(url)) return true;
        return false;
    }

    // ── Render markdown safely ────────────────────────────────────────
    function renderMarkdown(md, owner, repo) {
        // Rewrite relative image/link URLs to point at the GitHub repo
        const baseRaw = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/HEAD/';
        const baseRepo = 'https://github.com/' + owner + '/' + repo + '/blob/HEAD/';

        const renderer = new marked.Renderer();
        const origImage = renderer.image.bind(renderer);
        const origLink = renderer.link.bind(renderer);

        renderer.image = function (token) {
            if (token.href && !/^https?:\/\//.test(token.href)) {
                token.href = baseRaw + token.href;
            }
            // Render video URLs as playable <video> instead of <img>
            if (isVideoUrl(token.href)) {
                return '<video controls playsinline class="readme-video">' +
                    '<source src="' + token.href + '">' +
                    (token.text ? token.text : 'Your browser does not support video.') +
                    '</video>';
            }
            return origImage(token);
        };

        renderer.link = function (token) {
            if (token.href && !/^https?:\/\//.test(token.href) && !token.href.startsWith('#')) {
                token.href = baseRepo + token.href;
            }
            return origLink(token);
        };

        marked.setOptions({
            renderer: renderer,
            gfm: true,
            breaks: false,
            highlight: function (code, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    return hljs.highlight(code, { language: lang }).value;
                }
                return hljs.highlightAuto(code).value;
            }
        });

        const rawHtml = marked.parse(md);

        // Rewrite relative src in raw <video>/<source> HTML tags embedded in markdown
        var processedHtml = rawHtml.replace(
            /(<(?:video|source)\b[^>]*\bsrc=["'])(?!https?:\/\/)([^"']+)(["'])/gi,
            function (match, before, path, after) {
                return before + baseRaw + path + after;
            }
        );

        return DOMPurify.sanitize(processedHtml, {
            ADD_TAGS: ['img', 'video', 'source'],
            ADD_ATTR: ['target', 'src', 'alt', 'href', 'class', 'controls',
                       'playsinline', 'autoplay', 'loop', 'muted', 'type',
                       'width', 'height', 'poster']
        });
    }

    // ── Post-process: convert remaining video URLs to <video> elements ─
    function convertVideoElements(container) {
        // 1. <img> tags whose src is a video URL → <video>
        container.querySelectorAll('img').forEach(function (img) {
            if (isVideoUrl(img.getAttribute('src'))) {
                swapToVideo(img, img.getAttribute('src'), img.alt);
            }
        });

        // 2. <a> tags that are auto-linked video URLs (text === href)
        container.querySelectorAll('a').forEach(function (a) {
            var href = a.getAttribute('href');
            if (isVideoUrl(href) && a.textContent.trim() === href) {
                swapToVideo(a, href, '');
            }
        });
    }

    function swapToVideo(el, src, alt) {
        var video = document.createElement('video');
        video.controls = true;
        video.playsInline = true;
        video.className = 'readme-video';
        var source = document.createElement('source');
        source.src = src;
        video.appendChild(source);

        // For extensionless URLs (GitHub assets), fall back to <img> if
        // the browser can't load it as video (it might be an image)
        if (!/\.(mp4|webm|mov|ogv)(\?.*)?$/i.test(src)) {
            source.addEventListener('error', function () {
                var img = document.createElement('img');
                img.src = src;
                img.alt = alt || '';
                img.style.maxWidth = '100%';
                img.style.borderRadius = '8px';
                if (video.parentNode) video.parentNode.replaceChild(img, video);
            });
        }

        el.parentNode.replaceChild(video, el);
    }

    // ── Badge detection (CI/CD shields, codecov, etc.) ─────────────
    function isBadgeUrl(url) {
        return /(?:shields\.io|badgen\.net|img\.shields|badge\.svg|badge\.png|codecov\.io\/.*\/badge|github\.com\/[^/]+\/[^/]+\/actions\/workflows\/[^/]+\/badge)/i.test(url);
    }

    // ── Thumbnail: extract media from raw markdown by index ──────────
    // imageIndex: 0 = first (default), -1 = last, etc.
    function extractFirstMedia(md, owner, repo, imageIndex) {
        var baseRaw = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/HEAD/';
        var allMedia = [];
        var url, match;

        // 1. Markdown image syntax: ![alt](url)
        var mdImgRe = /!\[[^\]]*\]\(([^)\s]+)(?:\s[^)]*)?\)/g;
        while ((match = mdImgRe.exec(md)) !== null) {
            url = match[1];
            if (!/^https?:\/\//.test(url)) url = baseRaw + url;
            if (!isBadgeUrl(url)) {
                allMedia.push({ type: isVideoUrl(url) ? 'video' : 'image', url: url });
            }
        }

        // 2. HTML <img src="...">
        var htmlImgRe = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;
        while ((match = htmlImgRe.exec(md)) !== null) {
            url = match[1];
            if (!/^https?:\/\//.test(url)) url = baseRaw + url;
            if (!isBadgeUrl(url)) {
                allMedia.push({ type: isVideoUrl(url) ? 'video' : 'image', url: url });
            }
        }

        // 3. HTML <video>/<source src="...">
        var htmlVidRe = /<(?:video|source)\b[^>]*\bsrc=["']([^"']+)["']/gi;
        while ((match = htmlVidRe.exec(md)) !== null) {
            url = match[1];
            if (!/^https?:\/\//.test(url)) url = baseRaw + url;
            allMedia.push({ type: 'video', url: url });
        }

        // 4. Bare video URL on its own line
        var bareRe = /^(https?:\/\/\S+)$/gm;
        while ((match = bareRe.exec(md)) !== null) {
            if (isVideoUrl(match[1])) {
                allMedia.push({ type: 'video', url: match[1] });
            }
        }

        if (allMedia.length === 0) return null;

        var idx = (typeof imageIndex === 'number') ? imageIndex : 0;
        if (idx < 0) idx = allMedia.length + idx;
        idx = Math.max(0, Math.min(idx, allMedia.length - 1));
        return allMedia[idx];
    }

    // ── Thumbnail: populate the thumbnail element ─────────────────────
    function loadThumbnail(thumbEl, media) {
        thumbEl.innerHTML = '';
        if (!media) {
            thumbEl.innerHTML = '<div class="thumb-empty"><i class="fas fa-code"></i></div>';
            return;
        }

        if (media.type === 'image') {
            var img = document.createElement('img');
            img.src = media.url;
            img.alt = 'Project thumbnail';
            img.loading = 'lazy';
            img.addEventListener('error', function () {
                thumbEl.innerHTML = '<div class="thumb-empty"><i class="fas fa-code"></i></div>';
            });
            thumbEl.appendChild(img);
        } else {
            // Video: load metadata and seek to get a visible frame
            var video = document.createElement('video');
            video.muted = true;
            video.preload = 'metadata';
            video.playsInline = true;
            video.src = media.url;
            video.addEventListener('loadeddata', function () {
                video.currentTime = 0.1;
            });
            video.addEventListener('error', function () {
                thumbEl.innerHTML = '<div class="thumb-empty"><i class="fas fa-film"></i></div>';
            });
            thumbEl.appendChild(video);
            var overlay = document.createElement('div');
            overlay.className = 'thumb-play-overlay';
            overlay.innerHTML = '<i class="fas fa-play"></i>';
            thumbEl.appendChild(overlay);
        }
    }

    // ── README Modal ────────────────────────────────────────────────
    var modal = null;
    var modalBody = null;
    var modalClose = null;
    var modalBackdrop = null;

    function initModal() {
        modal = document.getElementById('readmeModal');
        if (!modal) return;
        modalBody = modal.querySelector('.readme-modal-body');
        modalClose = modal.querySelector('.readme-modal-close');
        modalBackdrop = modal.querySelector('.readme-modal-backdrop');

        modalClose.addEventListener('click', closeModal);
        modalBackdrop.addEventListener('click', closeModal);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
        });
    }

    function openModal(project) {
        if (!modal) return;
        var owner = project.owner || GITHUB_USER;
        modalBody.innerHTML =
            '<div class="readme-loading"><div class="spinner"></div> Loading README&hellip;</div>';
        modal.classList.add('active');
        var scrollY = window.scrollY;
        document.body.classList.add('readme-open');
        document.body.style.top = '-' + scrollY + 'px';
        document.body.dataset.scrollY = scrollY;

        fetchReadme(owner, project.repo)
            .then(function (md) {
                modalBody.innerHTML =
                    '<div class="readme-rendered">' +
                    renderMarkdown(md, owner, project.repo) +
                    '</div>' +
                    '<a class="github-repo-link" href="https://github.com/' +
                    encodeURIComponent(owner) + '/' +
                    encodeURIComponent(project.repo) +
                    '" target="_blank" rel="noopener noreferrer">' +
                    '<i class="fab fa-github"></i> View on GitHub</a>';
                convertVideoElements(modalBody.querySelector('.readme-rendered'));
                renderMathInElement(modalBody.querySelector('.readme-rendered'));
            })
            .catch(function () {
                modalBody.innerHTML =
                    '<div class="readme-error">' +
                    '<i class="fas fa-exclamation-triangle"></i> ' +
                    'README unavailable. ' +
                    '<a href="https://github.com/' +
                    encodeURIComponent(owner) + '/' +
                    encodeURIComponent(project.repo) +
                    '" target="_blank" rel="noopener noreferrer">View repo on GitHub</a>' +
                    '</div>';
            });
    }

    function closeModal() {
        if (!modal) return;
        // Stop any playing videos/audio inside the modal
        modal.querySelectorAll('video, audio').forEach(function (el) {
            el.pause();
            el.currentTime = 0;
        });
        modal.classList.remove('active');
        var scrollY = parseInt(document.body.dataset.scrollY || '0', 10);
        // Disable smooth scrolling so the restore is instant (no dizzy bounce)
        var htmlEl = document.documentElement;
        htmlEl.style.scrollBehavior = 'auto';
        document.body.classList.remove('readme-open');
        document.body.style.top = '';
        window.scrollTo(0, scrollY);
        // Re-enable smooth scrolling on the next frame
        requestAnimationFrame(function () {
            htmlEl.style.scrollBehavior = '';
        });
    }

    // ── Build project tile grid ───────────────────────────────────────
    function buildProjectGrid() {
        var container = document.getElementById('projects-grid');
        if (!container) return;

        PROJECTS.forEach(function (project, i) {
            var tile = document.createElement('div');
            tile.className = 'project-tile animate-on-scroll';

            var owner = project.owner || GITHUB_USER;
            var repoUrl = 'https://github.com/' +
                encodeURIComponent(owner) + '/' +
                encodeURIComponent(project.repo);

            tile.innerHTML =
                '<div class="tile-thumb" id="thumb-' + i + '">' +
                '  <div class="thumb-loading"><div class="spinner"></div></div>' +
                '</div>' +
                '<div class="tile-body">' +
                '  <div class="tile-title-row">' +
                '    <span class="tile-title">' + escapeHtml(project.title) + '</span>' +
                '    <span class="language-badge" style="background:' + project.color + '">' +
                       escapeHtml(project.language) +
                '    </span>' +
                '    <a class="tile-github-link" href="' + repoUrl + '"' +
                '       target="_blank" rel="noopener noreferrer" title="View on GitHub">' +
                '      <i class="fab fa-github"></i>' +
                '    </a>' +
                '  </div>' +
                '  <p class="tile-desc">' + escapeHtml(project.description) + '</p>' +
                (project.tags && project.tags.length ?
                '  <div class="tile-tags">' +
                    project.tags.slice().sort(function (a, b) {
                        return a.localeCompare(b);
                    }).map(function (t) {
                        return '<span class="tile-tag">' + escapeHtml(t) + '</span>';
                    }).join('') +
                '</div>' : '') +
                '</div>';

            tile.addEventListener('click', function (e) {
                if (e.target.closest('.tile-github-link')) return;
                openModal(project);
            });

            container.appendChild(tile);

            // Eagerly fetch README for thumbnail
            (function (proj, idx) {
                var projOwner = proj.owner || GITHUB_USER;
                fetchReadme(projOwner, proj.repo)
                    .then(function (md) {
                        var media = extractFirstMedia(md, projOwner, proj.repo, proj.imageIndex);
                        var thumbEl = document.getElementById('thumb-' + idx);
                        if (thumbEl) loadThumbnail(thumbEl, media);
                    })
                    .catch(function () {
                        var thumbEl = document.getElementById('thumb-' + idx);
                        if (thumbEl) {
                            thumbEl.innerHTML = '<div class="thumb-empty"><i class="fas fa-code"></i></div>';
                        }
                    });
            })(project, i);
        });
    }

    // ── Scroll-triggered entrance animations ──────────────────────────
    function initScrollAnimations() {
        var els = document.querySelectorAll('.animate-on-scroll');
        if (!('IntersectionObserver' in window)) {
            els.forEach(function (el) { el.classList.add('animate__animated', 'animate__fadeInUp'); });
            return;
        }
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate__animated', 'animate__fadeInUp');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });
        els.forEach(function (el) { observer.observe(el); });
    }

    // ── Smooth scroll for anchor links ────────────────────────────────
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(function (a) {
            a.addEventListener('click', function (e) {
                var target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    }

    // ── Utility ───────────────────────────────────────────────────────
    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ── KaTeX math rendering ──────────────────────────────────────────
    function renderMathInElement(el) {
        if (!el || typeof katex === 'undefined') return;
        // Process display math $$...$$ first, then inline $...$
        el.innerHTML = el.innerHTML
            .replace(/\$\$([^$]+?)\$\$/g, function (m, tex) {
                try { return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false }); }
                catch (e) { return m; }
            })
            .replace(/\$([^$\n]+?)\$/g, function (m, tex) {
                try { return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false }); }
                catch (e) { return m; }
            });
    }

    // ── Init ──────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        initModal();
        buildProjectGrid();
        initScrollAnimations();
        initSmoothScroll();
    });
})();
