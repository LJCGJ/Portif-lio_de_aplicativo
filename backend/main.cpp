#include <iostream>
#define WIN32_LEAN_AND_MEAN 
#include "httplib.h"

int main() {
    httplib::Server svr;

    // Define a pasta frontend como a raiz estatica do servidor
    auto ret = svr.set_base_dir("../frontend");
    
    if (!ret) {
        std::cout << "Erro: A pasta frontend não foi encontrada." << std::endl;
        return 1;
    }

    std::cout << "Servidor rodando na porta 8080..." << std::endl;
    std::cout << "Acesse no navegador: http://localhost:8080" << std::endl;
    std::cout << "Ou acesse diretamente: http://localhost:8080/index.html" << std::endl;
    
    // Trava a execucao e escuta a porta
    svr.listen("0.0.0.0", 8080);

    return 0;
}