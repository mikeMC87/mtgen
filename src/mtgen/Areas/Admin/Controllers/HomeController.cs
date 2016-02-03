﻿using Microsoft.AspNet.Authorization;
using Microsoft.AspNet.Mvc;

namespace mtgen.Areas.Admin.Controllers
{
    [Authorize]
    [Area("Admin")]
    public class HomeController : Controller
    {
        [Route("Admin")]
        public IActionResult Index()
        {
            return View();
        }

        public IActionResult Error()
        {
            return View();
        }
    }
}
