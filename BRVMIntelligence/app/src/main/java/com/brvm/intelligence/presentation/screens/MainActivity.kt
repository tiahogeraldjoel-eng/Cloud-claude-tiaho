package com.brvm.intelligence.presentation.screens

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.brvm.intelligence.presentation.navigation.BRVMNavGraph
import com.brvm.intelligence.presentation.navigation.Screen
import com.brvm.intelligence.presentation.theme.BRVMGreen
import com.brvm.intelligence.presentation.theme.BRVMIntelligenceTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            BRVMIntelligenceTheme {
                BRVMApp()
            }
        }
    }
}

private data class BottomNavItem(
    val screen: Screen,
    val icon: ImageVector,
    val label: String
)

private val BOTTOM_NAV_ITEMS = listOf(
    BottomNavItem(Screen.Dashboard, Icons.Default.Home, "Accueil"),
    BottomNavItem(Screen.StockList, Icons.Default.ShowChart, "Actions"),
    BottomNavItem(Screen.Portfolio, Icons.Default.AccountBalance, "Portefeuille"),
    BottomNavItem(Screen.Chat, Icons.Default.Psychology, "IA")
)

private val BOTTOM_NAV_ROUTES = BOTTOM_NAV_ITEMS.map { it.screen.route }.toSet()

@Composable
private fun BRVMApp() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination
    val currentRoute = currentDestination?.route

    val showBottomBar = currentRoute in BOTTOM_NAV_ROUTES

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    BOTTOM_NAV_ITEMS.forEach { item ->
                        val selected = currentDestination?.hierarchy
                            ?.any { it.route == item.screen.route } == true
                        NavigationBarItem(
                            icon = {
                                Icon(item.icon, contentDescription = item.label)
                            },
                            label = { Text(item.label) },
                            selected = selected,
                            onClick = {
                                navController.navigate(item.screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = BRVMGreen,
                                selectedTextColor = BRVMGreen,
                                indicatorColor = BRVMGreen.copy(alpha = 0.1f)
                            )
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            BRVMNavGraph(navController = navController)
        }
    }
}
