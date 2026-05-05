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
import com.brvm.alerte.presentation.chart.PriceChartScreen
import com.brvm.alerte.presentation.dashboard.DashboardScreen
import com.brvm.alerte.presentation.scanner.ScannerScreen
import com.brvm.alerte.presentation.settings.SettingsScreen

sealed class Screen(val route: String, val label: String, val icon: ImageVector) {
    object Dashboard : Screen("dashboard", "Bord", Icons.Filled.Dashboard)
    object Scanner : Screen("scanner", "Scanner", Icons.Filled.TravelExplore)
    object Alerts : Screen("alerts", "Alertes", Icons.Filled.Notifications)
    object Calendar : Screen("calendar", "Agenda", Icons.Filled.CalendarMonth)
    object Settings : Screen("settings", "Config.", Icons.Filled.Settings)
}

val bottomNavItems = listOf(
    Screen.Dashboard, Screen.Scanner, Screen.Alerts, Screen.Calendar, Screen.Settings
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BRVMNavGraph() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val showBottomBar = currentRoute in bottomNavItems.map { it.route }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    val currentDestination = navBackStackEntry?.destination
                    bottomNavItems.forEach { screen ->
                        NavigationBarItem(
                            icon = { Icon(screen.icon, contentDescription = screen.label) },
                            label = { Text(screen.label, style = MaterialTheme.typography.labelSmall) },
                            selected = currentDestination?.hierarchy?.any { it.route == screen.route } == true,
                            onClick = {
                                navController.navigate(screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) { saveState = true }
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

            // Graphique de prix — accessible depuis Scanner et Dashboard
            composable(
                route = "chart/{ticker}",
                enterTransition = { slideInVertically { it } + fadeIn() },
                exitTransition = { slideOutVertically { it } + fadeOut() }
            ) { backStackEntry ->
                val ticker = backStackEntry.arguments?.getString("ticker") ?: ""
                PriceChartScreen(ticker = ticker, navController = navController)
            }
        }
    }
}

fun navigateToChart(navController: androidx.navigation.NavController, ticker: String) {
    navController.navigate("chart/$ticker")
}
