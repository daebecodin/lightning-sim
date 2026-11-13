cmake_minimum_required(VERSION 3.16)
project(lightning_sim LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

option(LS_FREESTANDING "Bare wasm32 build without a C library (clang + wasm-ld, no Emscripten)" OFF)

# ---------------------------------------------------------------- core
# Pure simulation. No browser, no Emscripten, no libc calls.
add_library(lightning_core STATIC
  src/leader.cpp
  src/ground.cpp)
target_include_directories(lightning_core PUBLIC include)
# -ffp-contract=off keeps results bit-identical between native and wasm.
target_compile_options(lightning_core PRIVATE
  -Wall -Wextra -ffp-contract=off -fno-exceptions -fno-rtti)

set(LS_EXPORTS ls_header ls_init ls_reset ls_step ls_destroy)

if(EMSCRIPTEN)
  # ------------------------------------------------ WebAssembly (Emscripten)
  # A ".wasm" output makes emcc emit a standalone module with no JS glue.
  # web/src/sim/wasm-bindings.js instantiates it directly.
  add_executable(lightning_sim bindings/wasm_api.cpp src/platform_libc.cpp)
  target_link_libraries(lightning_sim PRIVATE lightning_core)
  target_compile_options(lightning_sim PRIVATE -fno-exceptions -fno-rtti)
  set_target_properties(lightning_sim PROPERTIES SUFFIX ".wasm")
  list(TRANSFORM LS_EXPORTS PREPEND "_" OUTPUT_VARIABLE LS_EM_EXPORTS)
  list(JOIN LS_EM_EXPORTS "," LS_EM_EXPORTS)
  target_link_options(lightning_sim PRIVATE
    --no-entry
    -sSTANDALONE_WASM=1
    -sALLOW_MEMORY_GROWTH=1
    -sINITIAL_MEMORY=4194304
    -sSTACK_SIZE=262144
    -sMALLOC=emmalloc
    -sFILESYSTEM=0
    "-sEXPORTED_FUNCTIONS=${LS_EM_EXPORTS}")
elseif(LS_FREESTANDING)
  # --------------------------------------- WebAssembly (clang, no libc)
  # Use with cmake/wasm32-freestanding.cmake as the toolchain file.
  add_executable(lightning_sim bindings/wasm_api.cpp src/platform_freestanding.cpp)
  target_link_libraries(lightning_sim PRIVATE lightning_core)
  target_compile_options(lightning_sim PRIVATE -fno-exceptions -fno-rtti)
  set_source_files_properties(src/platform_freestanding.cpp PROPERTIES COMPILE_OPTIONS -fno-builtin)
  set_target_properties(lightning_sim PROPERTIES SUFFIX ".wasm")
  target_link_options(lightning_sim PRIVATE
    -nostdlib -Wl,--no-entry -Wl,-z,stack-size=262144 -Wl,--strip-debug)
else()
  # -------------------------------------------------------- native tests
  add_executable(sim_test tests/sim_test.cpp bindings/wasm_api.cpp src/platform_libc.cpp)
  target_link_libraries(sim_test PRIVATE lightning_core)
  enable_testing()
  add_test(NAME sim_test COMMAND sim_test)
endif()
