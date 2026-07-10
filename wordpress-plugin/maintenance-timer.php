<?php
/**
 * Plugin Name: Maintenance Timer Client
 * Plugin URI: https://timer.soreva.app
 * Description: Affiche les informations de maintenance de votre site web
 * Version: 2.1.0
 * Author: Soreva
 * License: GPL v2 or later
 * Text Domain: maintenance-timer-client
 */

// Sécurité WordPress
defined('ABSPATH') or die('Accès direct interdit!');

class MaintenanceTimerClientPlugin {

    const DEFAULT_API_URL = 'https://timer.soreva.app/api-timer.php';

    private $plugin_version = '2.1.0';
    private $cache_duration = 300; // 5 minutes
    private $last_sync_error = null;
    
    public function __construct() {
        add_action('init', array($this, 'init'));
        add_action('admin_enqueue_scripts', array($this, 'admin_enqueue_scripts'));
        add_action('admin_menu', array($this, 'admin_menu'));
        add_action('admin_init', array($this, 'admin_init'));
        
        // Création du CPT
        add_action('init', array($this, 'create_maintenance_cpt'));
        add_filter('manage_maintenance_info_posts_columns', array($this, 'add_custom_columns'));
        add_action('manage_maintenance_info_posts_custom_column', array($this, 'fill_custom_columns'), 10, 2);
        add_action('add_meta_boxes', array($this, 'add_meta_boxes'));
        
        // AJAX
        add_action('wp_ajax_sync_maintenance_data', array($this, 'ajax_sync_maintenance_data'));
        add_action('wp_ajax_test_maintenance_api', array($this, 'ajax_test_api'));
        add_action('wp_ajax_clear_maintenance_logs', array($this, 'ajax_clear_logs'));
        
        // Tâche automatique de synchronisation
        add_action('maintenance_timer_sync_hook', array($this, 'sync_maintenance_data'));
        if (!wp_next_scheduled('maintenance_timer_sync_hook')) {
            wp_schedule_event(time(), 'hourly', 'maintenance_timer_sync_hook');
        }
        
        // Créer automatiquement le post de maintenance lors de l'activation
        register_activation_hook(__FILE__, array($this, 'create_maintenance_post'));
    }
    
    public function init() {
        load_plugin_textdomain('maintenance-timer-client', false, dirname(plugin_basename(__FILE__)) . '/languages');
    }
    
    public function admin_enqueue_scripts($hook) {
        // Charger les scripts sur les pages du plugin
        if (strpos($hook, 'maintenance') !== false || 
            get_post_type() === 'maintenance_info' || 
            $hook === 'settings_page_maintenance-timer-config') {
            
            wp_enqueue_style('maintenance-timer-admin', plugin_dir_url(__FILE__) . 'assets/style.css', array(), $this->plugin_version);
            wp_enqueue_script('maintenance-timer-admin', plugin_dir_url(__FILE__) . 'assets/script.js', array('jquery'), $this->plugin_version, true);
            
            wp_localize_script('maintenance-timer-admin', 'maintenance_timer_ajax', array(
                'ajax_url' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('maintenance_timer_nonce'),
                'loading_text' => __('Chargement...', 'maintenance-timer-client'),
                'error_text' => __('Erreur de chargement', 'maintenance-timer-client')
            ));
        }
    }
    
    public function admin_menu() {
        // Page de configuration
        add_options_page(
            __('Configuration Maintenance', 'maintenance-timer-client'),
            __('Maintenance', 'maintenance-timer-client'),
            'manage_options',
            'maintenance-timer-config',
            array($this, 'admin_page')
        );
        
        // Menu principal pour les infos de maintenance - PAGE CUSTOM
        add_menu_page(
            __('Maintenance de votre Site', 'maintenance-timer-client'),
            __('Maintenance', 'maintenance-timer-client'),
            'read',
            'maintenance-dashboard',
            array($this, 'maintenance_dashboard_page'),
            'dashicons-admin-tools',
            30
        );
    }
    
    public function admin_init() {
        register_setting('maintenance_timer_settings', 'maintenance_timer_api_url', array(
            'sanitize_callback' => array($this, 'sanitize_api_url_option')
        ));
        register_setting('maintenance_timer_settings', 'maintenance_timer_project_name', array(
            'sanitize_callback' => array($this, 'sanitize_project_name_option')
        ));
        register_setting('maintenance_timer_settings', 'maintenance_timer_freelance_username', array(
            'sanitize_callback' => array($this, 'sanitize_username_option')
        ));
        register_setting('maintenance_timer_settings', 'maintenance_timer_freelance_password', array(
            'sanitize_callback' => array($this, 'sanitize_password_option')
        ));
        register_setting('maintenance_timer_settings', 'maintenance_timer_auto_sync');

        $this->maybe_migrate_api_url();
    }

    private function get_api_base_url() {
        $url = get_option('maintenance_timer_api_url', self::DEFAULT_API_URL);

        if (empty($url) || strpos($url, 'trusty-projet.fr') !== false) {
            return self::DEFAULT_API_URL;
        }

        return $url;
    }

    private function maybe_migrate_api_url() {
        $url = get_option('maintenance_timer_api_url');

        if (empty($url) || strpos($url, 'trusty-projet.fr') !== false) {
            update_option('maintenance_timer_api_url', self::DEFAULT_API_URL);
        }
    }

    private function invalidate_auth_token() {
        delete_transient('maintenance_timer_auth_token');
    }

    public function sanitize_api_url_option($url) {
        $url = esc_url_raw(trim($url));

        if ($url === '') {
            $url = self::DEFAULT_API_URL;
        }

        if (strpos($url, 'trusty-projet.fr') !== false) {
            $url = self::DEFAULT_API_URL;
        }

        $previous = get_option('maintenance_timer_api_url');
        if ($previous !== $url) {
            $this->invalidate_auth_token();
        }

        return $url;
    }

    public function sanitize_project_name_option($project_name) {
        $project_name = sanitize_text_field(trim($project_name));
        $previous = get_option('maintenance_timer_project_name');

        if ($previous !== $project_name) {
            $this->invalidate_auth_token();
        }

        return $project_name;
    }

    public function sanitize_username_option($username) {
        $username = sanitize_email(trim($username));
        $previous = get_option('maintenance_timer_freelance_username');

        if ($previous !== $username) {
            $this->invalidate_auth_token();
        }

        return $username;
    }

    public function sanitize_password_option($password) {
        $password = trim($password);

        if ($password === '') {
            return get_option('maintenance_timer_freelance_password');
        }

        $this->invalidate_auth_token();

        return $password;
    }

    public function admin_page() {
        $saved_password = get_option('maintenance_timer_freelance_password');
        ?>
        <div class="wrap">
            <h1><?php _e('Configuration Maintenance de votre Site', 'maintenance-timer-client'); ?></h1>
            <p><?php _e('Configurez les paramètres pour afficher les informations de maintenance de votre site web.', 'maintenance-timer-client'); ?></p>
            
            <form method="post" action="options.php">
                <?php settings_fields('maintenance_timer_settings'); ?>
                <?php do_settings_sections('maintenance_timer_settings'); ?>
                
                <table class="form-table">
                    <tr>
                        <th scope="row"><?php _e('URL API Timer', 'maintenance-timer-client'); ?></th>
                        <td>
                            <input type="url" name="maintenance_timer_api_url"
                                   value="<?php echo esc_attr(get_option('maintenance_timer_api_url', self::DEFAULT_API_URL)); ?>"
                                   class="regular-text" required />
                            <p class="description"><?php _e('Adresse de l\'API Timer Soreva (par défaut : timer.soreva.app).', 'maintenance-timer-client'); ?></p>
                        </td>
                    </tr>

                    <tr>
                        <th scope="row"><?php _e('Nom de votre projet', 'maintenance-timer-client'); ?></th>
                        <td>
                            <input type="text" name="maintenance_timer_project_name" 
                                   value="<?php echo esc_attr(get_option('maintenance_timer_project_name')); ?>" 
                                   class="regular-text" required />
                            <p class="description"><?php _e('Le nom exact de votre projet dans l\'application Timer (généralement le nom de domaine du site).', 'maintenance-timer-client'); ?></p>
                        </td>
                    </tr>
                    
                    <tr>
                        <th scope="row"><?php _e('Adresse email du compte Soreva', 'maintenance-timer-client'); ?></th>
                        <td>
                            <input type="email" name="maintenance_timer_freelance_username" 
                                   value="<?php echo esc_attr(get_option('maintenance_timer_freelance_username')); ?>" 
                                   class="regular-text" />
                            <p class="description"><?php _e('L\'adresse email utilisée pour vous connecter au Dashboard et à l\'application Timer.', 'maintenance-timer-client'); ?></p>
                        </td>
                    </tr>
                    
                    <tr>
                        <th scope="row"><?php _e('Mot de passe du compte Soreva', 'maintenance-timer-client'); ?></th>
                        <td>
                            <input type="password" name="maintenance_timer_freelance_password"
                                   value=""
                                   placeholder="<?php echo esc_attr($saved_password ? __('•••••••• (déjà configuré)', 'maintenance-timer-client') : ''); ?>"
                                   class="regular-text" autocomplete="new-password" />
                            <p class="description"><?php _e('Le mot de passe de votre compte Soreva (identique à celui du Dashboard et de l\'application Timer).', 'maintenance-timer-client'); ?></p>
                        </td>
                    </tr>
                    
                    <tr>
                        <th scope="row"><?php _e('Synchronisation automatique', 'maintenance-timer-client'); ?></th>
                        <td>
                            <input type="checkbox" name="maintenance_timer_auto_sync" value="1" 
                                   <?php checked(get_option('maintenance_timer_auto_sync', 1), 1); ?> />
                            <label><?php _e('Mettre à jour automatiquement les données toutes les heures', 'maintenance-timer-client'); ?></label>
                        </td>
                    </tr>
                </table>
                
                <?php submit_button(); ?>
            </form>
            
            <hr>
            
            <h2><?php _e('Actions', 'maintenance-timer-client'); ?></h2>
            
            <button type="button" id="test-api-connection" class="button button-secondary">
                <?php _e('Tester la connexion', 'maintenance-timer-client'); ?>
            </button>
            
            <button type="button" id="sync-now" class="button button-primary" style="margin-left: 10px;">
                🔄 <?php _e('Synchroniser maintenant', 'maintenance-timer-client'); ?>
            </button>
            
            <div id="api-result" style="margin-top: 10px;"></div>
            
            <hr>
            
            <h2><?php _e('Informations de Debug', 'maintenance-timer-client'); ?></h2>
            <?php 
            $debug_info = $this->get_debug_info();
            $logs = get_option('maintenance_timer_debug_logs', array());
            ?>
            
            <div style="background: #f1f1f1; padding: 15px; border-radius: 5px; margin: 10px 0;">
                <h4><?php _e('Configuration actuelle :', 'maintenance-timer-client'); ?></h4>
                <ul>
                    <li><strong><?php _e('Nom du projet :', 'maintenance-timer-client'); ?></strong> "<?php echo esc_html($debug_info['project_name'] ?: 'Non configuré'); ?>"</li>
                    <li><strong><?php _e('Adresse email :', 'maintenance-timer-client'); ?></strong> <?php echo $debug_info['has_username'] ? '✅ Configuré' : '❌ Manquant'; ?></li>
                    <li><strong><?php _e('Mot de passe compte :', 'maintenance-timer-client'); ?></strong> <?php echo $debug_info['has_password'] ? '✅ Configuré' : '❌ Manquant'; ?></li>
                    <li><strong><?php _e('URL API :', 'maintenance-timer-client'); ?></strong> <?php echo esc_html($debug_info['api_url']); ?></li>
                </ul>
            </div>
            
            <?php if (!empty($logs)): ?>
            <div style="background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 5px; margin: 10px 0;">
                <h4><?php _e('Logs de debug (dernières entrées) :', 'maintenance-timer-client'); ?></h4>
                <div style="max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 12px; background: #f9f9f9; padding: 10px; border-radius: 3px;">
                    <?php foreach (array_reverse(array_slice($logs, -10)) as $log): ?>
                        <div><?php echo esc_html($log); ?></div>
                    <?php endforeach; ?>
                </div>
                <p style="margin-top: 10px;">
                    <button type="button" id="clear-logs" class="button button-secondary">
                        <?php _e('Effacer les logs', 'maintenance-timer-client'); ?>
                    </button>
                </p>
            </div>
            <?php endif; ?>
            
            <hr>
            
            <h2><?php _e('Comment ça marche ?', 'maintenance-timer-client'); ?></h2>
            <p><?php _e('Ce plugin affiche les informations de maintenance de votre site web :', 'maintenance-timer-client'); ?></p>
            <ul>
                <li><strong><?php _e('Temps restant', 'maintenance-timer-client'); ?></strong> : <?php _e('Combien d\'heures de maintenance il vous reste', 'maintenance-timer-client'); ?></li>
                <li><strong><?php _e('Historique', 'maintenance-timer-client'); ?></strong> : <?php _e('Le détail des sessions de travail effectuées', 'maintenance-timer-client'); ?></li>
                <li><strong><?php _e('Progression', 'maintenance-timer-client'); ?></strong> : <?php _e('Le pourcentage d\'heures utilisées', 'maintenance-timer-client'); ?></li>
            </ul>
            <p><?php _e('Les données sont automatiquement synchronisées toutes les heures. Vous pouvez consulter ces informations dans la section "Maintenance" de votre administration.', 'maintenance-timer-client'); ?></p>
        </div>
        
        <script>
        jQuery(document).ready(function($) {
            // Test de connexion API
            $('#test-api-connection').click(function() {
                var button = $(this);
                var result = $('#api-result');
                
                button.prop('disabled', true).text('<?php _e('Test en cours...', 'maintenance-timer-client'); ?>');
                result.html('');
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'test_maintenance_api',
                        nonce: '<?php echo wp_create_nonce('maintenance_timer_nonce'); ?>'
                    },
                    success: function(response) {
                        if (response.success) {
                            result.html('<div class="notice notice-success"><p>' + response.data.message + '</p></div>');
                        } else {
                            result.html('<div class="notice notice-error"><p>' + response.data.message + '</p></div>');
                        }
                    },
                    error: function() {
                        result.html('<div class="notice notice-error"><p><?php _e('Erreur de connexion', 'maintenance-timer-client'); ?></p></div>');
                    },
                    complete: function() {
                        button.prop('disabled', false).text('<?php _e('Tester la connexion', 'maintenance-timer-client'); ?>');
                    }
                });
            });

            // Synchronisation manuelle
            $('#sync-now').click(function() {
                var button = $(this);
                var result = $('#api-result');
                
                button.prop('disabled', true).text('<?php _e('Synchronisation...', 'maintenance-timer-client'); ?>');
                result.html('<div class="notice notice-info"><p><?php _e('Synchronisation en cours...', 'maintenance-timer-client'); ?></p></div>');
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'sync_maintenance_data',
                        nonce: '<?php echo wp_create_nonce('maintenance_timer_nonce'); ?>'
                    },
                    success: function(response) {
                        if (response.success) {
                            result.html('<div class="notice notice-success"><p>' + response.data.message + '</p></div>');
                        } else {
                            result.html('<div class="notice notice-error"><p>' + response.data.message + '</p></div>');
                        }
                    },
                    error: function() {
                        result.html('<div class="notice notice-error"><p><?php _e('Erreur de synchronisation', 'maintenance-timer-client'); ?></p></div>');
                    },
                    complete: function() {
                        button.prop('disabled', false).text('🔄 <?php _e('Synchroniser maintenant', 'maintenance-timer-client'); ?>');
                                         }
                 });
             });

            // Effacer les logs
            $('#clear-logs').click(function() {
                var button = $(this);
                var result = $('#api-result');
                
                if (!confirm('Êtes-vous sûr de vouloir effacer tous les logs de debug ?')) {
                    return;
                }
                
                button.prop('disabled', true).text('Effacement...');
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'clear_maintenance_logs',
                        nonce: '<?php echo wp_create_nonce('maintenance_timer_nonce'); ?>'
                    },
                    success: function(response) {
                        if (response.success) {
                            result.html('<div class="notice notice-success"><p>' + response.data.message + '</p></div>');
                            // Recharger la page pour cacher la section logs
                            setTimeout(function() {
                                window.location.reload();
                            }, 1500);
                        } else {
                            result.html('<div class="notice notice-error"><p>' + response.data.message + '</p></div>');
                        }
                    },
                    error: function() {
                        result.html('<div class="notice notice-error"><p>Erreur lors de l\'effacement</p></div>');
                    },
                    complete: function() {
                        button.prop('disabled', false).text('<?php _e('Effacer les logs', 'maintenance-timer-client'); ?>');
                    }
                });
            });
         });
         </script>
         <?php
    }
    
    /**
     * Page dashboard de maintenance
     */
    public function maintenance_dashboard_page() {
        // Vérifier si le plugin est configuré
        $project_name = get_option('maintenance_timer_project_name');
        $username = get_option('maintenance_timer_freelance_username');
        $password = get_option('maintenance_timer_freelance_password');
        
        if (empty($project_name) || empty($username) || empty($password)) {
            $this->show_configuration_needed_page();
            return;
        }

        // Synchroniser automatiquement lors de l'ouverture du dashboard
        $this->sync_maintenance_data();

        // Récupérer les données de maintenance (rafraîchies automatiquement si besoin)
        $maintenance_data = $this->get_cached_maintenance_data();

        // Si aucune donnée n'est trouvée (première visite par exemple), tenter une synchronisation
        if (!$maintenance_data || empty($maintenance_data['data'])) {
            if ($this->sync_maintenance_data()) {
                $maintenance_data = $this->get_cached_maintenance_data();
            }
        }

        if (!$maintenance_data || empty($maintenance_data['data'])) {
            if ($this->last_sync_error === 'project_not_found') {
                $this->show_project_not_found_page();
                return;
            }

            $this->show_sync_needed_page();
            return;
        }

        // Afficher la page de maintenance
        $this->show_maintenance_dashboard($maintenance_data['data'], $maintenance_data['last_sync'] ?? null);
    }
    
    /**
     * Afficher la page quand la configuration est nécessaire
     */
    private function show_configuration_needed_page() {
        ?>
        <div class="wrap">
            <h1>🔧 <?php _e('Configuration de Maintenance Requise', 'maintenance-timer-client'); ?></h1>
            
            <div style="background: #fff; padding: 30px; border-radius: 8px; border-left: 5px solid #d63638; margin: 20px 0;">
                <h2><?php _e('Configuration non terminée', 'maintenance-timer-client'); ?></h2>
                <p><?php _e('Pour afficher les informations de maintenance de votre site, vous devez d\'abord configurer le plugin.', 'maintenance-timer-client'); ?></p>
                
                <h3><?php _e('Étapes à suivre :', 'maintenance-timer-client'); ?></h3>
                <ol>
                    <li><?php _e('Contactez votre développeur pour obtenir les informations de configuration', 'maintenance-timer-client'); ?></li>
                    <li><?php _e('Rendez-vous dans la page de configuration', 'maintenance-timer-client'); ?></li>
                    <li><?php _e('Remplissez les champs requis', 'maintenance-timer-client'); ?></li>
                    <li><?php _e('Testez la connexion et synchronisez les données', 'maintenance-timer-client'); ?></li>
                </ol>
                
                <p style="margin-top: 30px;">
                    <a href="<?php echo admin_url('options-general.php?page=maintenance-timer-config'); ?>" class="button button-primary button-large">
                        ⚙️ <?php _e('Aller à la Configuration', 'maintenance-timer-client'); ?>
                    </a>
                </p>
            </div>
            
            <div style="background: #f0f8ff; padding: 20px; border-radius: 8px; border-left: 5px solid #0073aa;">
                <h3><?php _e('Informations nécessaires', 'maintenance-timer-client'); ?></h3>
                <p><?php _e('Votre développeur vous fournira :', 'maintenance-timer-client'); ?></p>
                <ul>
                    <li><strong><?php _e('Nom du projet :', 'maintenance-timer-client'); ?></strong> <?php _e('Le nom exact de votre site dans le système', 'maintenance-timer-client'); ?></li>
                    <li><strong><?php _e('Identifiants Soreva :', 'maintenance-timer-client'); ?></strong> <?php _e('L\'adresse email et le mot de passe de votre compte Dashboard/Timer', 'maintenance-timer-client'); ?></li>
                </ul>
            </div>
        </div>
        <?php
    }
    
    /**
     * Afficher la page quand le projet a été supprimé ou est introuvable
     */
    private function show_project_not_found_page() {
        $project_name = get_option('maintenance_timer_project_name');
        ?>
        <div class="wrap">
            <h1>⚠️ <?php _e('Projet introuvable', 'maintenance-timer-client'); ?></h1>

            <div style="background: #fff; padding: 30px; border-radius: 8px; border-left: 5px solid #d63638; margin: 20px 0;">
                <h2><?php _e('Projet supprimé ou introuvable', 'maintenance-timer-client'); ?></h2>
                <p><?php printf(
                    __('Le projet "%s" n\'existe plus dans l\'application Timer ou le nom configuré ne correspond pas.', 'maintenance-timer-client'),
                    esc_html($project_name)
                ); ?></p>
                <p><?php _e('Les anciennes données de maintenance ont été effacées. Vérifiez le nom du projet dans la configuration ou contactez votre développeur.', 'maintenance-timer-client'); ?></p>

                <p style="margin-top: 30px;">
                    <a href="<?php echo admin_url('options-general.php?page=maintenance-timer-config'); ?>" class="button button-primary button-large">
                        ⚙️ <?php _e('Vérifier la configuration', 'maintenance-timer-client'); ?>
                    </a>
                </p>
            </div>
        </div>
        <?php
    }

    /**
     * Afficher la page quand la synchronisation est nécessaire
     */
    private function show_sync_needed_page() {
        ?>
        <div class="wrap">
            <h1>🔄 <?php _e('Synchronisation des Données', 'maintenance-timer-client'); ?></h1>
            
            <div style="background: #fff; padding: 30px; border-radius: 8px; border-left: 5px solid #dba617; margin: 20px 0;">
                <h2><?php _e('Première synchronisation nécessaire', 'maintenance-timer-client'); ?></h2>
                <p><?php _e('Votre configuration est correcte, mais les données de maintenance n\'ont pas encore été synchronisées.', 'maintenance-timer-client'); ?></p>
                
                <p style="margin: 30px 0;">
                    <button type="button" id="sync-maintenance-now" class="button button-primary button-large">
                        🔄 <?php _e('Synchroniser les Données', 'maintenance-timer-client'); ?>
                    </button>
                </p>
                
                <div id="sync-result" style="margin-top: 20px;"></div>
            </div>
            
            <div style="background: #f0f8ff; padding: 20px; border-radius: 8px; border-left: 5px solid #0073aa;">
                <h3><?php _e('Que va-t-il se passer ?', 'maintenance-timer-client'); ?></h3>
                <p><?php _e('Après la synchronisation, vous verrez :', 'maintenance-timer-client'); ?></p>
                <ul>
                    <li>⏱️ <?php _e('Le temps de maintenance restant', 'maintenance-timer-client'); ?></li>
                    <li>📊 <?php _e('La progression de votre forfait', 'maintenance-timer-client'); ?></li>
                    <li>📝 <?php _e('L\'historique des sessions de travail', 'maintenance-timer-client'); ?></li>
                    <li>ℹ️ <?php _e('Les informations de votre projet', 'maintenance-timer-client'); ?></li>
                </ul>
            </div>
        </div>
        
        <script>
        jQuery(document).ready(function($) {
            $('#sync-maintenance-now').click(function() {
                var button = $(this);
                var result = $('#sync-result');
                
                button.prop('disabled', true).text('<?php _e('Synchronisation en cours...', 'maintenance-timer-client'); ?>');
                result.html('<div class="notice notice-info"><p>⏳ <?php _e('Synchronisation en cours, veuillez patienter...', 'maintenance-timer-client'); ?></p></div>');
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'sync_maintenance_data',
                        nonce: '<?php echo wp_create_nonce('maintenance_timer_nonce'); ?>'
                    },
                    success: function(response) {
                        if (response.success) {
                            result.html('<div class="notice notice-success"><p>✅ ' + response.data.message + '</p></div>');
                            setTimeout(function() {
                                window.location.reload();
                            }, 2000);
                        } else {
                            result.html('<div class="notice notice-error"><p>❌ ' + response.data.message + '</p></div>');
                        }
                    },
                    error: function() {
                        result.html('<div class="notice notice-error"><p>❌ <?php _e('Erreur de connexion', 'maintenance-timer-client'); ?></p></div>');
                    },
                    complete: function() {
                        button.prop('disabled', false).text('🔄 <?php _e('Synchroniser les Données', 'maintenance-timer-client'); ?>');
                    }
                });
            });
        });
        </script>
        <?php
    }
    
    /**
     * Récupérer les données de maintenance en cache
     */
    private function get_cached_maintenance_data() {
        // Chercher un post de maintenance existant
        $posts = get_posts(array(
            'post_type' => 'maintenance_info',
            'numberposts' => 1,
            'post_status' => 'publish'
        ));

        if (empty($posts)) {
            return false;
        }

        $post_id = $posts[0]->ID;
        $sync_status = get_post_meta($post_id, '_sync_status', true);

        if (in_array($sync_status, array('project_not_found', 'auth_failed'), true)) {
            return false;
        }

        $last_sync = (int) get_post_meta($post_id, '_last_sync', true);
        $is_fresh = $last_sync && (time() - $last_sync) < $this->cache_duration;

        // Rafraîchir automatiquement les données si le cache est trop ancien
        if (!$is_fresh) {
            $this->sync_maintenance_data();
            $last_sync = (int) get_post_meta($post_id, '_last_sync', true);
        }

        $data = get_post_meta($post_id, '_maintenance_data', true);

        if (!$data) {
            return false;
        }

        return array(
            'data' => $data,
            'last_sync' => $last_sync
        );
    }
    
    /**
     * Afficher le dashboard de maintenance
     */
    private function show_maintenance_dashboard($project_data, $last_sync = null) {
        // Les temps sont déjà en secondes dans l'API
        $total_time = $project_data['totalTime'] ?? 0;
        $used_time = $project_data['usedTime'] ?? 0;
        $remaining_time = max(0, $total_time - $used_time);
        $progress_percent = $total_time > 0 ? ($used_time / $total_time) * 100 : 0;

        // Fallback si aucune synchronisation n'a été effectuée
        if (empty($last_sync)) {
            $last_sync = time();
        }
        
        ?>
        <div class="wrap">
            <h1>🔧 <?php _e('Maintenance de votre Site', 'maintenance-timer-client'); ?></h1>
            
            <!-- Boutons d'action -->
            <div style="margin: 20px 0;">
                <button type="button" id="sync-maintenance-data" class="button button-primary">
                    🔄 <?php _e('Actualiser les Données', 'maintenance-timer-client'); ?>
                </button>
                <a href="<?php echo admin_url('options-general.php?page=maintenance-timer-config'); ?>" class="button button-secondary">
                    ⚙️ <?php _e('Configuration', 'maintenance-timer-client'); ?>
                </a>
            </div>
            
            <div id="maintenance-result" style="margin: 10px 0;"></div>
            
            <!-- Vue d'ensemble -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <!-- Temps restant -->
                <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 30px; border-radius: 12px; text-align: center;">
                    <h2 style="margin: 0 0 10px 0; color: white;"><?php _e('Temps Restant', 'maintenance-timer-client'); ?></h2>
                    <div style="font-size: 3em; font-weight: bold; font-family: monospace;">
                        <?php echo $this->format_duration($remaining_time); ?>
                    </div>
                    <div style="margin-top: 15px; font-size: 0.9em; opacity: 0.9;">
                        <?php 
                        if ($remaining_time > 0) {
                            echo '✅ ' . __('Maintenance Active', 'maintenance-timer-client');
                        } else {
                            echo '⚠️ ' . __('Heures Épuisées', 'maintenance-timer-client');
                        }
                        ?>
                    </div>
                </div>
                
                <!-- Informations projet -->
                <div style="background: #f8f9fa; padding: 30px; border-radius: 12px; border-left: 5px solid #007cba;">
                    <h2 style="margin: 0 0 15px 0; color: #23282d;"><?php _e('Informations', 'maintenance-timer-client'); ?></h2>
                    <?php if (!empty($project_data['clientName'])): ?>
                    <p><strong><?php _e('Client:', 'maintenance-timer-client'); ?></strong> <?php echo esc_html($project_data['clientName']); ?></p>
                    <?php endif; ?>
                    <p><strong><?php _e('Projet:', 'maintenance-timer-client'); ?></strong> <?php echo esc_html($project_data['name'] ?? get_option('maintenance_timer_project_name')); ?></p>
                    <p><strong><?php _e('Dernière mise à jour:', 'maintenance-timer-client'); ?></strong> <?php echo $last_sync ? date_i18n('d/m/Y H:i', $last_sync) : __('Jamais', 'maintenance-timer-client'); ?></p>
                    <p><strong><?php _e('Sessions de travail:', 'maintenance-timer-client'); ?></strong> <?php echo count($project_data['workSessions'] ?? []); ?></p>
                </div>
            </div>
            
            <!-- Barre de progression -->
            <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <h3 style="margin: 0;"><?php _e('Progression du Forfait', 'maintenance-timer-client'); ?></h3>
                    <span style="font-weight: bold; color: #666;"><?php echo number_format($progress_percent, 1); ?>% <?php _e('utilisé', 'maintenance-timer-client'); ?></span>
                </div>
                <div style="width: 100%; height: 25px; background: #e0e0e0; border-radius: 12px; overflow: hidden;">
                    <div class="maintenance-progress-fill" data-progress="<?php echo min(100, $progress_percent); ?>" style="width: <?php echo min(100, $progress_percent); ?>%; height: 100%; background: linear-gradient(90deg, #00a32a, #4dc34d); transition: width 0.5s ease; position: relative;">
                        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent); animation: shimmer 2s infinite;"></div>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-top: 20px;">
                    <div style="text-align: center; padding: 15px; background: #f0f8ff; border-radius: 8px;">
                        <div style="font-size: 1.3em; font-weight: bold; color: #0073aa;"><?php echo $this->format_duration($total_time); ?></div>
                        <div style="font-size: 0.9em; color: #666;"><?php _e('Temps Total', 'maintenance-timer-client'); ?></div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #fff5f5; border-radius: 8px;">
                        <div style="font-size: 1.3em; font-weight: bold; color: #d63638;"><?php echo $this->format_duration($used_time); ?></div>
                        <div style="font-size: 0.9em; color: #666;"><?php _e('Temps Utilisé', 'maintenance-timer-client'); ?></div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #f0fff4; border-radius: 8px;">
                        <div style="font-size: 1.3em; font-weight: bold; color: #00a32a;"><?php echo $this->format_duration($remaining_time); ?></div>
                        <div style="font-size: 0.9em; color: #666;"><?php _e('Temps Restant', 'maintenance-timer-client'); ?></div>
                    </div>
                </div>
            </div>
            
            <!-- Historique des sessions -->
            <?php if (!empty($project_data['workSessions'])): ?>
            <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #ddd;">
                <h3><?php _e('Historique des Sessions de Travail', 'maintenance-timer-client'); ?></h3>
                <div style="max-height: 400px; overflow-y: auto;">
                    <?php 
                    $sessions = array_slice(array_reverse($project_data['workSessions']), 0, 10);
                    foreach ($sessions as $session): 
                    ?>
                    <div style="padding: 15px; margin-bottom: 10px; background: #f8f9fa; border-radius: 6px; border-left: 4px solid #007cba;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div style="flex: 1;">
                                <?php if (!empty($session['startTime'])): ?>
                                <div style="font-size: 13px; color: #666; margin-bottom: 5px;">
                                    📅 <?php 
                                    $date = date_create($session['startTime']);
                                    if ($date) {
                                        echo date_format($date, 'd/m/Y H:i');
                                    }
                                    ?>
                                </div>
                                <?php endif; ?>
                                
                                <?php if (!empty($session['subject'])): ?>
                                <div style="font-weight: 500; color: #23282d;">
                                    <?php echo esc_html($session['subject']); ?>
                                </div>
                                <?php endif; ?>
                            </div>
                            
                            <div style="font-weight: 600; color: #00a32a; text-align: right; font-family: monospace;">
                                ⏱️ <?php echo $this->format_duration($session['duration'] ?? 0); ?>
                            </div>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
            <?php endif; ?>
        </div>
        
        <script>
        jQuery(document).ready(function($) {
            $('#sync-maintenance-data').click(function() {
                var button = $(this);
                var result = $('#maintenance-result');
                
                button.prop('disabled', true).text('<?php _e('Synchronisation...', 'maintenance-timer-client'); ?>');
                result.html('<div class="notice notice-info"><p>⏳ <?php _e('Synchronisation en cours...', 'maintenance-timer-client'); ?></p></div>');
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'sync_maintenance_data',
                        nonce: '<?php echo wp_create_nonce('maintenance_timer_nonce'); ?>'
                    },
                    success: function(response) {
                        if (response.success) {
                            result.html('<div class="notice notice-success"><p>✅ ' + response.data.message + '</p></div>');
                            setTimeout(function() {
                                window.location.reload();
                            }, 2000);
                        } else {
                            result.html('<div class="notice notice-error"><p>❌ ' + response.data.message + '</p></div>');
                        }
                    },
                    error: function() {
                        result.html('<div class="notice notice-error"><p>❌ <?php _e('Erreur de connexion', 'maintenance-timer-client'); ?></p></div>');
                    },
                    complete: function() {
                        button.prop('disabled', false).text('🔄 <?php _e('Actualiser les Données', 'maintenance-timer-client'); ?>');
                    }
                });
            });
        });
        </script>
        
        <style>
        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
        
        @media screen and (max-width: 782px) {
            div[style*="grid-template-columns: 1fr 1fr"] {
                display: block !important;
            }
            
            div[style*="grid-template-columns: 1fr 1fr"] > div {
                margin-bottom: 15px;
            }
            
            div[style*="grid-template-columns: 1fr 1fr 1fr"] {
                display: block !important;
            }
            
            div[style*="grid-template-columns: 1fr 1fr 1fr"] > div {
                margin-bottom: 10px;
            }
        }
        </style>
        <?php
    }
    
    // Création du CPT
    public function create_maintenance_cpt() {
        $labels = array(
            'name' => __('Maintenance de votre Site', 'maintenance-timer-client'),
            'singular_name' => __('Maintenance', 'maintenance-timer-client'),
            'menu_name' => __('Maintenance', 'maintenance-timer-client'),
            'all_items' => __('Informations de Maintenance', 'maintenance-timer-client'),
            'view_item' => __('Voir les détails', 'maintenance-timer-client'),
            'search_items' => __('Rechercher', 'maintenance-timer-client'),
            'not_found' => __('Aucune information trouvée', 'maintenance-timer-client')
        );

        $args = array(
            'labels' => $labels,
            'public' => false,
            'show_ui' => true,
            'show_in_menu' => false, // Géré par admin_menu
            'show_in_admin_bar' => false,
            'can_export' => false,
            'has_archive' => false,
            'exclude_from_search' => true,
            'publicly_queryable' => false,
            'capability_type' => 'post',
            'capabilities' => array(
                'create_posts' => 'do_not_allow'
            ),
            'map_meta_cap' => true,
            'supports' => array('title'),
            'menu_icon' => 'dashicons-admin-tools'
        );

        register_post_type('maintenance_info', $args);
    }
    
    // Colonnes personnalisées
    public function add_custom_columns($columns) {
        return array(
            'cb' => $columns['cb'],
            'title' => __('Type d\'information', 'maintenance-timer-client'),
            'status' => __('Statut', 'maintenance-timer-client'),
            'last_update' => __('Dernière mise à jour', 'maintenance-timer-client'),
            'actions' => __('Actions', 'maintenance-timer-client')
        );
    }

    public function fill_custom_columns($column, $post_id) {
        $last_sync = get_post_meta($post_id, '_last_sync', true);
        
        switch ($column) {
            case 'status':
                if ($last_sync) {
                    $minutes_ago = (time() - $last_sync) / 60;
                    if ($minutes_ago < 60) {
                        echo '<span style="color: #00a32a;">● Synchronisé</span>';
                    } else {
                        echo '<span style="color: #dba617;">● ' . round($minutes_ago/60) . 'h</span>';
                    }
                } else {
                    echo '<span style="color: #d63638;">● Non synchronisé</span>';
                }
                break;
                
            case 'last_update':
                if ($last_sync) {
                    echo date_i18n('d/m/Y H:i', $last_sync);
                } else {
                    echo '-';
                }
                break;
                
            case 'actions':
                echo '<button type="button" class="button-secondary sync-maintenance-btn" data-post-id="' . $post_id . '">';
                echo '🔄 Actualiser';
                echo '</button>';
                break;
        }
    }
    
    // Meta boxes
    public function add_meta_boxes() {
        add_meta_box(
            'maintenance_overview',
            __('Résumé de votre Maintenance', 'maintenance-timer-client'),
            array($this, 'maintenance_overview_meta_box'),
            'maintenance_info',
            'normal',
            'high'
        );
        
        add_meta_box(
            'maintenance_stats',
            __('Statistiques Détaillées', 'maintenance-timer-client'),
            array($this, 'maintenance_stats_meta_box'),
            'maintenance_info',
            'side',
            'default'
        );
        
        add_meta_box(
            'maintenance_sessions',
            __('Historique des Sessions de Travail', 'maintenance-timer-client'),
            array($this, 'maintenance_sessions_meta_box'),
            'maintenance_info',
            'normal',
            'default'
        );
    }

    public function maintenance_overview_meta_box($post) {
        $project_data = get_post_meta($post->ID, '_maintenance_data', true);
        $last_sync = get_post_meta($post->ID, '_last_sync', true);
        
        if (!$project_data) {
            echo '<div style="text-align: center; padding: 40px; background: #f9f9f9; border-radius: 8px;">';
            echo '<h3>' . __('Aucune donnée disponible', 'maintenance-timer-client') . '</h3>';
            echo '<p>' . __('Les données de maintenance n\'ont pas encore été synchronisées.', 'maintenance-timer-client') . '</p>';
            echo '<p>' . __('Veuillez configurer le plugin dans Réglages > Maintenance et synchroniser les données.', 'maintenance-timer-client') . '</p>';
            echo '</div>';
            return;
        }
        
        // Les temps sont déjà en secondes dans l'API
        $total_time = $project_data['totalTime'] ?? 0;
        $used_time = $project_data['usedTime'] ?? 0;
        $remaining_time = max(0, $total_time - $used_time);
        $progress_percent = $total_time > 0 ? ($used_time / $total_time) * 100 : 0;
        
        ?>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
            <!-- Temps restant -->
            <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 30px; border-radius: 12px; text-align: center;">
                <h3 style="margin: 0 0 10px 0; color: white;"><?php _e('Temps Restant', 'maintenance-timer-client'); ?></h3>
                <div style="font-size: 2.5em; font-weight: bold; font-family: monospace;">
                    <?php echo $this->format_duration($remaining_time); ?>
                </div>
            </div>
            
            <!-- Client info -->
            <div style="background: #f8f9fa; padding: 30px; border-radius: 12px; border-left: 5px solid #007cba;">
                <h3 style="margin: 0 0 15px 0; color: #23282d;"><?php _e('Informations', 'maintenance-timer-client'); ?></h3>
                <?php if (!empty($project_data['clientName'])): ?>
                <p><strong><?php _e('Client:', 'maintenance-timer-client'); ?></strong> <?php echo esc_html($project_data['clientName']); ?></p>
                <?php endif; ?>
                <p><strong><?php _e('Projet:', 'maintenance-timer-client'); ?></strong> <?php echo esc_html($project_data['name'] ?? get_option('maintenance_timer_project_name')); ?></p>
                <?php if ($last_sync): ?>
                <p><strong><?php _e('Dernière mise à jour:', 'maintenance-timer-client'); ?></strong> <?php echo date_i18n('d/m/Y H:i', $last_sync); ?></p>
                <?php endif; ?>
            </div>
        </div>
        
        <!-- Barre de progression -->
        <div style="margin: 20px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span><strong><?php _e('Progression:', 'maintenance-timer-client'); ?></strong></span>
                <span><?php echo number_format($progress_percent, 1); ?>% <?php _e('utilisé', 'maintenance-timer-client'); ?></span>
            </div>
            <div style="width: 100%; height: 20px; background: #e0e0e0; border-radius: 10px; overflow: hidden;">
                <div class="maintenance-progress-fill" data-progress="<?php echo min(100, $progress_percent); ?>" style="width: <?php echo min(100, $progress_percent); ?>%; height: 100%; background: linear-gradient(90deg, #00a32a, #4dc34d); transition: width 0.5s ease;"></div>
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-top: 20px;">
            <div style="text-align: center; padding: 15px; background: #f0f8ff; border-radius: 8px;">
                <div style="font-size: 1.2em; font-weight: bold; color: #0073aa;"><?php echo $this->format_duration($total_time); ?></div>
                <div style="font-size: 0.9em; color: #666;"><?php _e('Temps Total', 'maintenance-timer-client'); ?></div>
            </div>
            <div style="text-align: center; padding: 15px; background: #fff5f5; border-radius: 8px;">
                <div style="font-size: 1.2em; font-weight: bold; color: #d63638;"><?php echo $this->format_duration($used_time); ?></div>
                <div style="font-size: 0.9em; color: #666;"><?php _e('Temps Utilisé', 'maintenance-timer-client'); ?></div>
            </div>
            <div style="text-align: center; padding: 15px; background: #f0fff4; border-radius: 8px;">
                <div style="font-size: 1.2em; font-weight: bold; color: #00a32a;"><?php echo count($project_data['workSessions'] ?? []); ?></div>
                <div style="font-size: 0.9em; color: #666;"><?php _e('Sessions', 'maintenance-timer-client'); ?></div>
            </div>
        </div>
        <?php
    }

    public function maintenance_stats_meta_box($post) {
        $project_data = get_post_meta($post->ID, '_maintenance_data', true);
        
        if (!$project_data) {
            echo '<p>' . __('Synchronisez d\'abord les données.', 'maintenance-timer-client') . '</p>';
            return;
        }
        
        ?>
        <div style="text-align: center;">
            <button type="button" class="button button-primary button-large sync-maintenance-btn" data-post-id="<?php echo $post->ID; ?>" style="width: 100%; margin-bottom: 15px;">
                🔄 <?php _e('Actualiser les Données', 'maintenance-timer-client'); ?>
            </button>
        </div>
        
        <div style="padding: 15px; background: #f9f9f9; border-radius: 6px;">
            <h4 style="margin-top: 0;"><?php _e('Statut', 'maintenance-timer-client'); ?></h4>
                    <?php
        // Les temps sont déjà en secondes dans l'API
        $total_time = $project_data['totalTime'] ?? 0;
        $used_time = $project_data['usedTime'] ?? 0;
        $remaining_time = max(0, $total_time - $used_time);
            
            if ($remaining_time > 0) {
                echo '<div style="color: #00a32a; font-weight: bold;">✅ ' . __('Maintenance Active', 'maintenance-timer-client') . '</div>';
            } else {
                echo '<div style="color: #d63638; font-weight: bold;">⚠️ ' . __('Heures Épuisées', 'maintenance-timer-client') . '</div>';
            }
            ?>
        </div>
        <?php
    }

    public function maintenance_sessions_meta_box($post) {
        $project_data = get_post_meta($post->ID, '_maintenance_data', true);
        
        if (!$project_data || empty($project_data['workSessions'])) {
            echo '<p>' . __('Aucune session de travail enregistrée.', 'maintenance-timer-client') . '</p>';
            return;
        }
        
        $sessions = array_slice(array_reverse($project_data['workSessions']), 0, 15);
        
        ?>
        <div style="max-height: 400px; overflow-y: auto;">
            <?php foreach ($sessions as $session): ?>
            <div style="padding: 12px; margin-bottom: 8px; background: #f8f9fa; border-radius: 6px; border-left: 4px solid #007cba;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="flex: 1;">
                        <?php if (!empty($session['startTime'])): ?>
                        <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
                            📅 <?php 
                            $date = date_create($session['startTime']);
                            if ($date) {
                                echo date_format($date, 'd/m/Y H:i');
                            }
                            ?>
                        </div>
                        <?php endif; ?>
                        
                        <?php if (!empty($session['subject'])): ?>
                        <div style="font-weight: 500; margin-bottom: 4px;">
                            <?php echo esc_html($session['subject']); ?>
                        </div>
                        <?php endif; ?>
                    </div>
                    
                    <div style="font-weight: 600; color: #00a32a; text-align: right;">
                        ⏱️ <?php echo $this->format_duration($session['duration'] ?? 0); ?>
                    </div>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
        <?php
    }
    
    // Fonctions utilitaires
    private function authenticate_api() {
        $username = get_option('maintenance_timer_freelance_username');
        $password = get_option('maintenance_timer_freelance_password');
        
        if (empty($username) || empty($password)) {
            $this->last_sync_error = 'auth_failed';
            return false;
        }
        
        // Vérifier le cache
        $cached_token = get_transient('maintenance_timer_auth_token');
        if ($cached_token) {
            return $cached_token;
        }
        
        $api_url = $this->get_api_base_url();

        // Authentification
        $response = wp_remote_post($api_url . '?action=login', array(
            'timeout' => 30,
            'headers' => array('Content-Type' => 'application/json'),
            'body' => json_encode(array(
                'email' => $username,
                'username' => $username,
                'password' => $password
            ))
        ));
        
        if (is_wp_error($response)) {
            $this->last_sync_error = 'auth_failed';
            return false;
        }
        
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        
        if (isset($data['success']) && $data['success'] && isset($data['token'])) {
            set_transient('maintenance_timer_auth_token', $data['token'], 20 * HOUR_IN_SECONDS);
            return $data['token'];
        }

        $this->last_sync_error = 'auth_failed';
        return false;
    }
    
    private function get_project_data() {
        $project_name = get_option('maintenance_timer_project_name');
        if (!$project_name) {
            $this->last_sync_error = 'config_missing';
            $this->log_error('Nom du projet non configuré');
            return false;
        }
        
        $token = $this->authenticate_api();
        if (!$token) {
            $this->log_error('Échec de l\'authentification API');
            return false;
        }
        
        $api_url = $this->get_api_base_url();

        // Appel API
        $response = wp_remote_get($api_url . '?action=projects', array(
            'timeout' => 30,
            'headers' => array(
                'Authorization' => 'Bearer ' . $token,
                'Content-Type' => 'application/json'
            )
        ));
        
        if (is_wp_error($response)) {
            $this->last_sync_error = 'api_error';
            $this->log_error('Erreur réseau: ' . $response->get_error_message());
            return false;
        }
        
        $body = wp_remote_retrieve_body($response);
        $this->log_error('Réponse API brute: ' . $body);
        
        $data = json_decode($body, true);
        
        if (!$data) {
            $this->last_sync_error = 'api_error';
            $this->log_error('Réponse API invalide - JSON non valide');
            return false;
        }
        
        $this->log_error('Données décodées: ' . print_r($data, true));
        
        if (!isset($data['success']) || !$data['success']) {
            $this->last_sync_error = 'api_error';
            $this->log_error('Erreur API: ' . ($data['message'] ?? 'Réponse non réussie'));
            $this->log_error('Structure complète de la réponse: ' . print_r($data, true));
            return false;
        }
        
        // Vérifier si la réponse contient les projets dans 'data' ou 'projects'
        $projects_data = null;
        if (isset($data['data']) && is_array($data['data'])) {
            $projects_data = $data['data'];
            $this->log_error('Projets trouvés dans la clé "data"');
        } elseif (isset($data['projects']) && is_array($data['projects'])) {
            $projects_data = $data['projects'];
            $this->log_error('Projets trouvés dans la clé "projects"');
        } else {
            $this->last_sync_error = 'api_error';
            $this->log_error('Ni "data" ni "projects" trouvés dans la réponse');
            $this->log_error('Clés disponibles: ' . implode(', ', array_keys($data)));
            return false;
        }
        
        $this->log_error('Nombre de projets trouvés: ' . count($projects_data));
        
        // Debug : lister tous les projets disponibles
        $available_projects = array_map(function($p) { return $p['name'] ?? 'Nom manquant'; }, $projects_data);
        $this->log_error('Projets disponibles: ' . implode(', ', $available_projects));
        $this->log_error('Projet recherché: "' . $project_name . '"');
        
        // Chercher le projet
        foreach ($projects_data as $project) {
            if (isset($project['name']) && strcasecmp($project['name'], $project_name) === 0) {
                $this->log_error('Projet trouvé !');
                return $project;
            }
        }
        
        $this->last_sync_error = 'project_not_found';
        $this->log_error('Projet "' . $project_name . '" non trouvé dans la liste des projets disponibles');
        return false;
    }
    
    private function format_duration($seconds) {
        if ($seconds < 60) {
            return $seconds . 's';
        } elseif ($seconds < 3600) {
            $minutes = floor($seconds / 60);
            $remaining_seconds = $seconds % 60;
            return $minutes . 'min' . ($remaining_seconds > 0 ? ' ' . $remaining_seconds . 's' : '');
        } else {
            $hours = floor($seconds / 3600);
            $remaining_minutes = floor(($seconds % 3600) / 60);
            return $hours . 'h' . ($remaining_minutes > 0 ? ' ' . $remaining_minutes . 'min' : '');
        }
    }
    
    /**
     * Logger une erreur pour le debug
     */
    private function log_error($message) {
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('[Maintenance Timer Client] ' . $message);
        }
        
        // Stocker aussi en option temporaire pour le debug AJAX
        $logs = get_option('maintenance_timer_debug_logs', array());
        $logs[] = date('Y-m-d H:i:s') . ' - ' . $message;
        
        // Garder seulement les 20 derniers logs
        if (count($logs) > 20) {
            $logs = array_slice($logs, -20);
        }
        
        update_option('maintenance_timer_debug_logs', $logs);
    }
    
    /**
     * Récupérer les infos de debug
     */
    private function get_debug_info() {
        $project_name = get_option('maintenance_timer_project_name');
        $username = get_option('maintenance_timer_freelance_username');
        $logs = get_option('maintenance_timer_debug_logs', array());
        
        return array(
            'project_name' => $project_name,
            'has_username' => !empty($username),
            'has_password' => !empty(get_option('maintenance_timer_freelance_password')),
            'api_url' => $this->get_api_base_url(),
            'recent_logs' => array_slice($logs, -5), // 5 derniers logs
            'wp_debug' => defined('WP_DEBUG') && WP_DEBUG
        );
    }
    
    // AJAX Functions
    public function ajax_test_api() {
        check_ajax_referer('maintenance_timer_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error(array('message' => __('Permissions insuffisantes', 'maintenance-timer-client')));
        }
        
        $token = $this->authenticate_api();
        
        if ($token) {
            wp_send_json_success(array('message' => __('Connexion API réussie !', 'maintenance-timer-client')));
        } else {
            wp_send_json_error(array('message' => __('Échec de la connexion. Vérifiez vos paramètres.', 'maintenance-timer-client')));
        }
    }
    
    public function ajax_clear_logs() {
        check_ajax_referer('maintenance_timer_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error(array('message' => __('Permissions insuffisantes', 'maintenance-timer-client')));
        }
        
        delete_option('maintenance_timer_debug_logs');
        wp_send_json_success(array('message' => __('Logs effacés !', 'maintenance-timer-client')));
    }
    
    public function ajax_sync_maintenance_data() {
        check_ajax_referer('maintenance_timer_nonce', 'nonce');
        
        $result = $this->sync_maintenance_data();
        
        if ($result) {
            wp_send_json_success(array('message' => __('Données synchronisées avec succès !', 'maintenance-timer-client')));
        } else {
            // Debug : récupérer plus d'infos sur l'erreur
            $project_name = get_option('maintenance_timer_project_name');
            $debug_info = $this->get_debug_info();
            
            $error_message = __('Erreur lors de la synchronisation.', 'maintenance-timer-client');
            
            if (empty($project_name)) {
                $error_message .= ' ' . __('Nom du projet non configuré.', 'maintenance-timer-client');
            } elseif ($this->last_sync_error === 'project_not_found') {
                $error_message = sprintf(
                    __('Projet "%s" introuvable ou supprimé. Les données en cache ont été effacées.', 'maintenance-timer-client'),
                    $project_name
                );
            } elseif ($this->last_sync_error === 'auth_failed') {
                $error_message .= ' ' . __('Échec de l\'authentification. Vérifiez votre email et mot de passe Soreva.', 'maintenance-timer-client');
            } elseif (isset($debug_info['error'])) {
                $error_message .= ' ' . $debug_info['error'];
            } else {
                $error_message .= ' ' . sprintf(__('Projet "%s" introuvable dans la liste.', 'maintenance-timer-client'), $project_name);
            }
            
            wp_send_json_error(array('message' => $error_message, 'debug' => $debug_info));
        }
    }
    
    public function sync_maintenance_data() {
        $this->last_sync_error = null;
        $project_data = $this->get_project_data();
        $maintenance_post = $this->get_or_create_maintenance_post();

        if (!$project_data) {
            if ($maintenance_post) {
                if ($this->last_sync_error === 'project_not_found') {
                    delete_post_meta($maintenance_post->ID, '_maintenance_data');
                    delete_post_meta($maintenance_post->ID, '_last_sync');
                    update_post_meta($maintenance_post->ID, '_sync_status', 'project_not_found');
                } elseif ($this->last_sync_error === 'auth_failed') {
                    update_post_meta($maintenance_post->ID, '_sync_status', 'auth_failed');
                }
            }

            return false;
        }
        
        if ($maintenance_post) {
            update_post_meta($maintenance_post->ID, '_maintenance_data', $project_data);
            update_post_meta($maintenance_post->ID, '_last_sync', time());
            delete_post_meta($maintenance_post->ID, '_sync_status');
            return true;
        }
        
        return false;
    }
    
    private function get_or_create_maintenance_post() {
        // Chercher un post existant
        $posts = get_posts(array(
            'post_type' => 'maintenance_info',
            'numberposts' => 1,
            'post_status' => 'publish'
        ));
        
        if (!empty($posts)) {
            return $posts[0];
        }
        
        // Créer un nouveau post
        return $this->create_maintenance_post();
    }
    
    public function create_maintenance_post() {
        $project_name = get_option('maintenance_timer_project_name', 'Votre Site Web');
        
        $post_id = wp_insert_post(array(
            'post_title' => sprintf(__('Maintenance de %s', 'maintenance-timer-client'), $project_name),
            'post_type' => 'maintenance_info',
            'post_status' => 'publish',
            'post_content' => ''
        ));
        
        if ($post_id && !is_wp_error($post_id)) {
            return get_post($post_id);
        }
        
        return false;
    }
}

// Initialiser le plugin
new MaintenanceTimerClientPlugin();

// Hook de désactivation pour nettoyer
register_deactivation_hook(__FILE__, function() {
    wp_clear_scheduled_hook('maintenance_timer_sync_hook');
});
