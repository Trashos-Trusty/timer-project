/**
 * Maintenance Timer Client Plugin - JavaScript
 */

jQuery(document).ready(function($) {
    'use strict';
    
    // Variables globales
    const AJAX_URL = maintenance_timer_ajax.ajax_url;
    const NONCE = maintenance_timer_ajax.nonce;
    
    /**
     * Gestion des boutons de synchronisation dans les colonnes
     */
    $(document).on('click', '.sync-maintenance-btn', function(e) {
        e.preventDefault();
        
        const button = $(this);
        const postId = button.data('post-id');
        const originalText = button.text();
        
        // État de chargement
        button.prop('disabled', true)
              .addClass('loading')
              .text('Synchronisation...');
        
        // Appel AJAX
        $.ajax({
            url: AJAX_URL,
            type: 'POST',
            data: {
                action: 'sync_maintenance_data',
                post_id: postId,
                nonce: NONCE
            },
            success: function(response) {
                if (response.success) {
                    showNotification('success', response.data.message);
                    
                    // Recharger la page après 1 seconde pour voir les nouveaux données
                    setTimeout(function() {
                        window.location.reload();
                    }, 1000);
                } else {
                    showNotification('error', response.data.message || 'Erreur de synchronisation');
                }
            },
            error: function(xhr, status, error) {
                console.error('Erreur AJAX:', error);
                showNotification('error', 'Erreur de connexion. Veuillez réessayer.');
            },
            complete: function() {
                // Restaurer l'état du bouton
                button.prop('disabled', false)
                      .removeClass('loading')
                      .text(originalText);
            }
        });
    });
    
    /**
     * Auto-refresh des données toutes les 5 minutes si on est sur la page de maintenance
     */
    if (window.location.href.indexOf('maintenance_info') !== -1) {
        setInterval(function() {
            // Synchronisation silencieuse en arrière-plan
            $.ajax({
                url: AJAX_URL,
                type: 'POST',
                data: {
                    action: 'sync_maintenance_data',
                    nonce: NONCE,
                    silent: true
                },
                success: function(response) {
                    if (response.success) {
                        // Mettre à jour discrètement l'indicateur de dernière mise à jour
                        updateLastSyncTime();
                    }
                }
            });
        }, 5 * 60 * 1000); // 5 minutes
    }
    
    /**
     * Afficher une notification
     */
    function showNotification(type, message) {
        // Supprimer les anciennes notifications
        $('.maintenance-notice').remove();
        
        const noticeClass = type === 'success' ? 'notice-success' : 
                           type === 'error' ? 'notice-error' : 'notice-info';
        
        const notice = $('<div>', {
            class: `notice ${noticeClass} maintenance-notice is-dismissible`,
            html: `<p>${message}</p>`
        });
        
        // Insérer la notification après le titre de la page
        if ($('.wrap h1').length) {
            $('.wrap h1').after(notice);
        } else {
            $('.wrap').prepend(notice);
        }
        
        // Auto-dismiss après 5 secondes pour les succès
        if (type === 'success') {
            setTimeout(function() {
                notice.fadeOut(function() {
                    $(this).remove();
                });
            }, 5000);
        }
        
        // Faire défiler vers la notification si nécessaire
        $('html, body').animate({
            scrollTop: notice.offset().top - 50
        }, 300);
    }
    
    /**
     * Mettre à jour l'heure de dernière synchronisation
     */
    function updateLastSyncTime() {
        const now = new Date();
        const timeString = now.toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Mettre à jour tous les éléments qui affichent la dernière sync
        $('[data-last-sync]').text(timeString);
    }
    
    /**
     * Amélioration de l'UX - Confirmations
     */
    $(document).on('click', '.sync-maintenance-btn', function(e) {
        if (!$(this).hasClass('button-large')) {
            // Pour les petits boutons dans les colonnes, pas de confirmation
            return true;
        }
        
        // Pour les gros boutons, demander confirmation
        if (!confirm('Voulez-vous synchroniser les données de maintenance maintenant ?')) {
            e.preventDefault();
            return false;
        }
    });
    
    /**
     * Gestion des tooltips pour les indicateurs de statut
     */
    if (typeof $.fn.tooltip === 'function') {
        $('.status-indicator').tooltip({
            position: {
                my: "left+15 center",
                at: "right center"
            }
        });
    }
    
    /**
     * Amélioration visuelle des barres de progression
     */
    function animateProgressBars() {
        $('.maintenance-progress-fill').each(function() {
            const $bar = $(this);
            const targetWidth = parseFloat($bar.data('progress'));

            if (isNaN(targetWidth)) {
                return;
            }

            // Animation d'entrée
            $bar.css('width', '0%').animate({
                width: `${targetWidth}%`
            }, 1000, 'swing');
        });
    }

    // Lancer l'animation des barres de progression au chargement
    if ($('.maintenance-progress-fill').length) {
        setTimeout(animateProgressBars, 500);
    }
    
    /**
     * Gestion du responsive - Améliorer l'affichage mobile
     */
    function handleResponsive() {
        const windowWidth = $(window).width();
        
        if (windowWidth < 782) {
            // Mode mobile
            $('.maintenance-session-item').addClass('mobile-session');
            $('div[style*="grid-template-columns"]').addClass('mobile-grid');
        } else {
            // Mode desktop
            $('.maintenance-session-item').removeClass('mobile-session');
            $('div[style*="grid-template-columns"]').removeClass('mobile-grid');
        }
    }
    
    // Vérifier au chargement et au redimensionnement
    handleResponsive();
    $(window).resize(handleResponsive);
    
    /**
     * Amélioration de l'accessibilité
     */
    function improveAccessibility() {
        // Ajouter des attributs ARIA
        $('.sync-maintenance-btn').attr('aria-label', 'Synchroniser les données de maintenance');
        $('.status-indicator').attr('role', 'status');
        
        // Gestion du focus clavier
        $('.sync-maintenance-btn').on('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                $(this).click();
            }
        });
    }
    
    improveAccessibility();
    
    /**
     * Debug mode - afficher des informations en console si en mode debug
     */
    if (window.location.href.indexOf('debug=1') !== -1) {
        console.log('🔧 Maintenance Timer Client - Mode Debug');
        console.log('AJAX URL:', AJAX_URL);
        console.log('Nonce:', NONCE);
        
        // Logger les appels AJAX
        $(document).ajaxSend(function(event, xhr, settings) {
            if (settings.url === AJAX_URL) {
                console.log('📡 AJAX Send:', settings.data);
            }
        });
        
        $(document).ajaxComplete(function(event, xhr, settings) {
            if (settings.url === AJAX_URL) {
                console.log('✅ AJAX Complete:', xhr.responseText);
            }
        });
    }
    
    /**
     * Easter egg - Animation spéciale si tout va bien
     */
    if ($('.status-indicator.online').length && Math.random() < 0.1) {
        setTimeout(function() {
            $('.status-indicator.online').addClass('pulse');
        }, 2000);
    }
    
    // CSS pour l'easter egg
    $('<style>')
        .prop('type', 'text/css')
        .html(`
            .status-indicator.pulse {
                animation: pulse 2s ease-in-out infinite;
            }
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
        `)
        .appendTo('head');
});

/**
 * Fonctions globales disponibles dans le scope window
 */
window.MaintenanceTimer = {
    /**
     * Synchroniser manuellement
     */
    sync: function() {
        jQuery('.sync-maintenance-btn').first().click();
    },
    
    /**
     * Afficher les informations de debug
     */
    debug: function() {
        console.table({
            'Plugin Version': '2.0.0',
            'AJAX URL': maintenance_timer_ajax.ajax_url,
            'User Agent': navigator.userAgent,
            'Screen Resolution': screen.width + 'x' + screen.height,
            'Current Time': new Date().toISOString()
        });
    }
}; 