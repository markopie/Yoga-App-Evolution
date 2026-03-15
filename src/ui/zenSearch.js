export function setupZenSearch() {
    const zenSearch = document.getElementById('zenSearch');
    const zenSearchDropdown = document.getElementById('zenSearchDropdown');
    const categoryFilter = document.getElementById('categoryFilter');
    const sequenceSelect = document.getElementById('sequenceSelect');

    if (!zenSearch) return;

    zenSearch.addEventListener('focus', () => {
        if (zenSearchDropdown) {
            zenSearchDropdown.style.display = 'flex';
        }
    });

    zenSearch.addEventListener('blur', (e) => {
        setTimeout(() => {
            if (zenSearchDropdown && !zenSearchDropdown.contains(document.activeElement)) {
                zenSearchDropdown.style.display = 'none';
            }
        }, 150);
    });

    zenSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (query.length > 0) {
            if (typeof window.openBrowse === 'function') {
                window.openBrowse();
                const browseSearch = document.getElementById('browseSearch');
                if (browseSearch) {
                    browseSearch.value = query;
                    browseSearch.dispatchEvent(new Event('input'));
                }
            }
        }
    });

    if (categoryFilter) {
        categoryFilter.addEventListener('change', () => {
            if (zenSearchDropdown) {
                zenSearchDropdown.style.display = 'none';
            }
            zenSearch.blur();
        });
    }

    if (sequenceSelect) {
        sequenceSelect.addEventListener('change', () => {
            if (zenSearchDropdown) {
                zenSearchDropdown.style.display = 'none';
            }
            zenSearch.blur();
        });
    }

    const zenProfileIcon = document.getElementById('zenProfileIcon');
    const signOutBtn = document.getElementById('signOutBtn');

    if (zenProfileIcon && signOutBtn) {
        zenProfileIcon.addEventListener('click', () => {
            signOutBtn.style.display = signOutBtn.style.display === 'block' ? 'none' : 'block';
        });

        document.addEventListener('click', (e) => {
            if (!zenProfileIcon.contains(e.target)) {
                signOutBtn.style.display = 'none';
            }
        });
    }
}

window.setupZenSearch = setupZenSearch;
