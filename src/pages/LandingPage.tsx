import React, { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { RouteId } from '../types/financial';
import { AuthModal } from '../components/layout/AuthModal';
import { LandingNav } from '../components/landing/LandingNav';
import { HeroSection } from '../components/landing/HeroSection';
import { AboutSection } from '../components/landing/AboutSection';
import { IntelligenceSection } from '../components/landing/IntelligenceSection';
import { ProductSection } from '../components/landing/ProductSection';
import { LandingFooter } from '../components/landing/LandingFooter';

interface LandingPageProps {
  onEnter: (route?: RouteId) => void;
}

/**
 * Brand introduction → business → intelligence → platform → application.
 * The landing page is a view of the same SPA: every CTA lands on a real,
 * fully functional module rather than a separate marketing site.
 */
export function LandingPage({ onEnter }: LandingPageProps) {
  const { setAuthModalOpen, isAuthenticated } = useApp();
  const wasAuthenticatedOnMount = useRef(isAuthenticated);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  // A sign-in from the brand site carries the visitor into the workspace.
  useEffect(() => {
    if (!wasAuthenticatedOnMount.current && isAuthenticated) {
      onEnter('overview');
    }
  }, [isAuthenticated, onEnter]);

  return (
    <div className="landing-shell">
      <LandingNav onEnter={onEnter} onSignIn={() => setAuthModalOpen(true)} />
      <main>
        <HeroSection onEnter={onEnter} />
        <AboutSection />
        <IntelligenceSection />
        <ProductSection onEnter={onEnter} />
      </main>
      <LandingFooter onEnter={onEnter} onSignIn={() => setAuthModalOpen(true)} />
      <AuthModal />
    </div>
  );
}
