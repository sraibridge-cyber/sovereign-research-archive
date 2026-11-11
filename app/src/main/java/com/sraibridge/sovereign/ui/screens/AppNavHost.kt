package com.sraibridge.sovereign.ui.screens

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable

@Composable
fun AppNavHost(navController: NavHostController) {
    NavHost(navController = navController, startDestination = "search") {
        composable("search") {
            SearchScreen(
                onDocumentClick = { sourceId ->
                    navController.navigate("document/$sourceId")
                }
            )
        }
        composable("document/{sourceId}") { backStackEntry ->
            val sourceId = backStackEntry.arguments?.getString("sourceId") ?: ""
            DocumentDetailScreen(
                sourceId = sourceId,
                onBack = { navController.popBackStack() }
            )
        }
    }
}