package com.brvm.alerte.presentation.navigation

import androidx.compose.animation.*
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*
import com.brvm.alerte.presentation.alerts.AlertsScreen
import com.brvm.alerte.presentation.calendar.CalendarScreen
import com.brvm.alerte.presentation.dashboard.DashboardScreen
import com.brvm.alerte.presentation.scanner.ScannerScreen
import com.brvm.alerte.presentation.settings.SettingsScreen

sealed class Screen(val route: String, val label: String, val icon: ImageVector) {
    object Dashboard : Screen("dashboard", "Tableau de bord", Icons.Filled.Dashboard)
    object Scanner : Screen("scanner", "Scanner", Icons.Filled.TravelExplore)
    object Alerts : Screen("alerts", "Alertes", Icons.Filled.Notifications)
    object Calendar : Screen("calendar", "Calendrier", Icons.Filled.CalendarMonth)
    object Settings : Screen("settings", "Paramètres", Icons.Filled.Settings)
}

val bottomNavItems = listOf(
    Screen.Dashboard,
    Screen.Scanner,
    Screen.Alerts,
    Screen.Calendar,
    Screen.Settings
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BRVMNavGraph() {
    val navController = rememberNavController()

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                tonalElevation = androidx.compose.ui.unit.dp.times(0f)
            ) {
                val navBackStackEntry by navController.currentBackStackEntryAsState()
                val currentDestination = navBackStackEntry?.destination

                bottomNavItems.forEach { screen ->
                    NavigationBarItem(
                        icon = { Icon(screen.icon, contentDescription = screen.label) },
                        label = { Text(screen.label, style = MaterialTheme.typography.labelSmall) },
                        selected = currentDestination?.hierarchy?.any { it.route == screen.route } == true,
                        onClick = {
                            navController.navigate(screen.route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.primary,
                            selectedTextColor = MaterialTheme.colorScheme.primary,
                            indicatorColor = MaterialTheme.colorScheme.primaryContainer
                        )
                    )
                }
            }
        }
    ) { paddingValues ->
        NavHost(
            navController = navController,
            startDestination = Screen.Dashboard.route,
            modifier = Modifier.padding(paddingValues),
            enterTransition = { fadeIn() + slideInHorizontally() },
            exitTransition = { fadeOut() + slideOutHorizontally() }
        ) {
            composable(Screen.Dashboard.route) { DashboardScreen(navController) }
            composable(Screen.Scanner.route) { ScannerScreen(navController) }
            composable(Screen.Alerts.route) { AlertsScreen(navController) }
            composable(Screen.Calendar.route) { CalendarScreen(navController) }
            composable(Screen.Settings.route) { SettingsScreen() }
        }
    }
}
