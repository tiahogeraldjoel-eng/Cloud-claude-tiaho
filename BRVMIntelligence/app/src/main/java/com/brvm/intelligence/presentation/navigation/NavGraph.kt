package com.brvm.intelligence.presentation.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.brvm.intelligence.presentation.screens.analysis.AnalysisScreen
import com.brvm.intelligence.presentation.screens.chat.ChatScreen
import com.brvm.intelligence.presentation.screens.dashboard.DashboardScreen
import com.brvm.intelligence.presentation.screens.onboarding.OnboardingScreen
import com.brvm.intelligence.presentation.screens.portfolio.PortfolioScreen
import com.brvm.intelligence.presentation.screens.stocks.StockDetailScreen
import com.brvm.intelligence.presentation.screens.stocks.StockListScreen

sealed class Screen(val route: String) {
    object Onboarding : Screen("onboarding")
    object Dashboard : Screen("dashboard")
    object StockList : Screen("stocks")
    object StockDetail : Screen("stocks/{symbol}") {
        fun createRoute(symbol: String) = "stocks/$symbol"
    }
    object Portfolio : Screen("portfolio")
    object Analysis : Screen("analysis/{symbol}") {
        fun createRoute(symbol: String) = "analysis/$symbol"
    }
    object Chat : Screen("chat")
    object Settings : Screen("settings")
}

@Composable
fun BRVMNavGraph(
    navController: NavHostController,
    startDestination: String = Screen.Dashboard.route
) {
    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable(Screen.Onboarding.route) {
            OnboardingScreen(
                onComplete = {
                    navController.navigate(Screen.Dashboard.route) {
                        popUpTo(Screen.Onboarding.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.Dashboard.route) {
            DashboardScreen(
                onStockClick = { symbol ->
                    navController.navigate(Screen.StockDetail.createRoute(symbol))
                },
                onSeeAllStocks = { navController.navigate(Screen.StockList.route) },
                onChatClick = { navController.navigate(Screen.Chat.route) }
            )
        }

        composable(Screen.StockList.route) {
            StockListScreen(
                onStockClick = { symbol ->
                    navController.navigate(Screen.StockDetail.createRoute(symbol))
                },
                onBack = { navController.popBackStack() }
            )
        }

        composable(
            route = Screen.StockDetail.route,
            arguments = listOf(navArgument("symbol") { type = NavType.StringType })
        ) { backStackEntry ->
            val symbol = backStackEntry.arguments?.getString("symbol") ?: return@composable
            StockDetailScreen(
                symbol = symbol,
                onBack = { navController.popBackStack() },
                onAnalyzeClick = {
                    navController.navigate(Screen.Analysis.createRoute(symbol))
                }
            )
        }

        composable(Screen.Portfolio.route) {
            PortfolioScreen(
                onStockClick = { symbol ->
                    navController.navigate(Screen.StockDetail.createRoute(symbol))
                }
            )
        }

        composable(
            route = Screen.Analysis.route,
            arguments = listOf(navArgument("symbol") { type = NavType.StringType })
        ) { backStackEntry ->
            val symbol = backStackEntry.arguments?.getString("symbol") ?: return@composable
            AnalysisScreen(
                symbol = symbol,
                onBack = { navController.popBackStack() }
            )
        }

        composable(Screen.Chat.route) {
            ChatScreen(
                onBack = { navController.popBackStack() }
            )
        }
    }
}
