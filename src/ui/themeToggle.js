// src/ui/themeToggle.js
// Dark mode theme management with accessibility and persistence

import { supabase } from '../services/supabaseClient.js';

const THEME_KEY = 'yoga-app-theme';
const THEME_LIGHT = 'light';
const THEME_DARK = 'dark';

class ThemeManager {
    constructor() {
        this.currentTheme = null;
        this.button = null;
        this.systemPreference = null;
        this.userId = null;
    }

    init(userId = null) {
        this.userId = userId;
        this.systemPreference = window.matchMedia('(prefers-color-scheme: dark)');

        const savedTheme = this.loadTheme();
        this.applyTheme(savedTheme);

        this.systemPreference.addEventListener('change', (e) => {
            if (!localStorage.getItem(THEME_KEY)) {
                this.applyTheme(e.matches ? THEME_DARK : THEME_LIGHT);
            }
        });

        this.createToggleButton();
    }

    loadTheme() {
        const localTheme = localStorage.getItem(THEME_KEY);
        if (localTheme) {
            return localTheme;
        }

        return this.systemPreference.matches ? THEME_DARK : THEME_LIGHT;
    }

    async saveThemeToSupabase(theme) {
        if (!this.userId) return;

        try {
            const { error } = await supabase
                .from('user_preferences')
                .upsert({
                    user_id: this.userId,
                    theme: theme,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id'
                });

            if (error && error.code !== '42P01') {
                console.warn('Theme sync skipped:', error.message);
            }
        } catch (err) {
            console.warn('Theme sync error:', err);
        }
    }

    applyTheme(theme) {
        this.currentTheme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_KEY, theme);

        this.updateButton();
        this.saveThemeToSupabase(theme);
    }

    toggleTheme() {
        const newTheme = this.currentTheme === THEME_LIGHT ? THEME_DARK : THEME_LIGHT;
        this.applyTheme(newTheme);
    }

    createToggleButton() {
        this.button = document.createElement('button');
        this.button.id = 'themeToggle';
        this.button.className = 'theme-toggle tiny';
        this.button.setAttribute('aria-label', 'Toggle dark mode');
        this.button.setAttribute('title', 'Toggle dark mode');

        this.button.addEventListener('click', () => this.toggleTheme());

        const signOutBtn = document.getElementById('signOutBtn');
        if (signOutBtn && signOutBtn.parentElement) {
            signOutBtn.parentElement.insertBefore(this.button, signOutBtn);
        }

        this.updateButton();
    }

    updateButton() {
        if (!this.button) return;

        const isDark = this.currentTheme === THEME_DARK;
        this.button.innerHTML = isDark ? '☀️' : '🌙';
        this.button.setAttribute('aria-pressed', isDark);
        this.button.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
        this.button.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }

    setUserId(userId) {
        this.userId = userId;
        if (userId) {
            this.saveThemeToSupabase(this.currentTheme);
        }
    }
}

export const themeManager = new ThemeManager();
