/* ============================================
   RESORT FAZENDA SÃO JOÃO - MAIN JS
   ============================================ */

document.addEventListener('DOMContentLoaded', function() {

    // --- Hamburger Menu ---
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');

    if (hamburger && navMenu) {
        hamburger.addEventListener('click', function() {
            navMenu.classList.toggle('open');
        });
    }

    // --- Mobile dropdown toggle ---
    // Em telas de toque o hover não existe, então o primeiro tap num item
    // com submenu abre o dropdown em vez de navegar direto.
    document.querySelectorAll('.nav-menu > li').forEach(item => {
        const dropdown = item.querySelector(':scope > .dropdown');
        const link = item.querySelector(':scope > a');
        if (!dropdown || !link) return;

        link.addEventListener('click', function(e) {
            if (window.innerWidth > 768) return;
            if (!item.classList.contains('dropdown-open')) {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.nav-menu > li.dropdown-open').forEach(li => {
                    if (li !== item) li.classList.remove('dropdown-open');
                });
                item.classList.add('dropdown-open');
            }
        });
    });

    // Close menu on link click (mobile) — ignora o tap que só abriu o dropdown
    document.querySelectorAll('.nav-menu a').forEach(link => {
        link.addEventListener('click', function(e) {
            if (e.defaultPrevented) return;
            navMenu.classList.remove('open');
        });
    });

    // --- Hero Slider ---
    const heroSlides = document.querySelectorAll('.hero-slide');
    const heroDots = document.querySelectorAll('.hero-nav .dot');
    let currentSlide = 0;
    let heroInterval;

    function showSlide(index) {
        heroSlides.forEach(s => s.classList.remove('active'));
        heroDots.forEach(d => d.classList.remove('active'));
        currentSlide = (index + heroSlides.length) % heroSlides.length;
        if (heroSlides[currentSlide]) heroSlides[currentSlide].classList.add('active');
        if (heroDots[currentSlide]) heroDots[currentSlide].classList.add('active');
    }

    function nextSlide() {
        showSlide(currentSlide + 1);
    }

    function prevSlide() {
        showSlide(currentSlide - 1);
    }

    if (heroSlides.length > 0) {
        heroInterval = setInterval(nextSlide, 5000);
    }

    // Hero navigation
    const prevBtn = document.querySelector('.hero-arrow.prev');
    const nextBtn = document.querySelector('.hero-arrow.next');

    if (prevBtn) prevBtn.addEventListener('click', () => { prevSlide(); clearInterval(heroInterval); heroInterval = setInterval(nextSlide, 5000); });
    if (nextBtn) nextBtn.addEventListener('click', () => { nextSlide(); clearInterval(heroInterval); heroInterval = setInterval(nextSlide, 5000); });

    heroDots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            showSlide(index);
            clearInterval(heroInterval);
            heroInterval = setInterval(nextSlide, 5000);
        });
    });

    // --- Testimonials Slider ---
    const testimonials = document.querySelectorAll('.testimonial');
    const testimonialDots = document.querySelectorAll('.testimonial-nav .dot');
    let currentTestimonial = 0;
    let testimonialInterval;

    function showTestimonial(index) {
        testimonials.forEach(t => t.classList.remove('active'));
        testimonialDots.forEach(d => d.classList.remove('active'));
        currentTestimonial = (index + testimonials.length) % testimonials.length;
        if (testimonials[currentTestimonial]) testimonials[currentTestimonial].classList.add('active');
        if (testimonialDots[currentTestimonial]) testimonialDots[currentTestimonial].classList.add('active');
    }

    function nextTestimonial() {
        showTestimonial(currentTestimonial + 1);
    }

    if (testimonials.length > 0) {
        testimonialInterval = setInterval(nextTestimonial, 6000);
    }

    testimonialDots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            showTestimonial(index);
            clearInterval(testimonialInterval);
            testimonialInterval = setInterval(nextTestimonial, 6000);
        });
    });

    // --- Cookie Banner ---
    const cookieBanner = document.querySelector('.cookie-banner');
    if (cookieBanner) {
        const acceptBtn = cookieBanner.querySelector('button');
        if (acceptBtn) {
            acceptBtn.addEventListener('click', function() {
                cookieBanner.style.display = 'none';
                localStorage.setItem('cookiesAccepted', 'true');
            });
        }
        if (localStorage.getItem('cookiesAccepted') === 'true') {
            cookieBanner.style.display = 'none';
        }
    }

    // --- Smooth Scroll for anchor links ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // --- Intersection Observer for animations ---
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.programacao-card, .blog-card, .about-stats, .acomodacao-card').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // --- Active nav link ---
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-menu > li > a').forEach(link => {
        const href = link.getAttribute('href');
        if (href && (href === currentPage || (currentPage === '' && href === 'index.html'))) {
            link.classList.add('active');
        }
    });

    // --- Header scroll effect ---
    const header = document.querySelector('.header');
    if (header) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 100) {
                header.style.boxShadow = '0 4px 30px rgba(0,0,0,0.3)';
            } else {
                header.style.boxShadow = 'var(--shadow)';
            }
        });
    }
});
