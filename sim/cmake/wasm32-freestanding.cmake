# Toolchain file for a bare wasm32 build with a stock clang and wasm-ld.
#   cmake -S sim -B build/wasm-clang -DCMAKE_TOOLCHAIN_FILE=sim/cmake/wasm32-freestanding.cmake -DLS_FREESTANDING=ON
set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR wasm32)
set(CMAKE_CXX_COMPILER clang++)
set(CMAKE_CXX_COMPILER_TARGET wasm32)
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)
set(CMAKE_CXX_FLAGS_INIT "-ffreestanding -fvisibility=hidden -mbulk-memory")
set(CMAKE_CXX_FLAGS_RELEASE_INIT "-O3 -DNDEBUG")
set(CMAKE_EXECUTABLE_SUFFIX ".wasm")
